/**
 * The team's Projects screen (T16.2, owner-approved): templates as cards on top ("Start from a template"), then the
 * projects with search and sort, each row opening its project and carrying a ⋯ menu grouped the way real tools
 * do it — Open · Rename, Duplicate · Save as template, Copy link · Delete. "+ New project" asks for a name and
 * what to start from (a blank board or a template). Viewers see only what's safe for them (open, copy link).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type Me } from '../api';
import { ContextMenu, type MenuItem, type MenuState } from '../board/ContextMenu';
import { Icon } from '../board/LayerRow';
import { AskDialog, type AskSpec } from '../ui/AskDialog';
import { PresetsDialog } from './PresetsDialog';
import { TeamDialog } from './TeamDialog';

interface ProjectRow {
  id: string;
  name: string;
  isTemplate: boolean;
  updatedAt: string;
}

type Sort = 'edited' | 'name';

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date: short enough for one line. */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}

/** A steady colour per name for the row's letter tile, from the board's group palette. */
const TILE_COLORS = ['blue', 'purple', 'green', 'orange', 'red', 'grey'] as const;
export function tileColor(name: string): (typeof TILE_COLORS)[number] {
  let h = 0;
  for (const c of name) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length] ?? 'grey';
}
const initialOf = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';

/** Projects filtered by `query` (name, any case) and sorted. */
export function shownProjects<T extends { name: string; updatedAt: string }>(rows: readonly T[], query: string, sort: Sort): T[] {
  const q = query.trim().toLocaleLowerCase();
  const hits = q ? rows.filter((r) => r.name.toLocaleLowerCase().includes(q)) : [...rows];
  return sort === 'name' ? hits.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) : hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function Projects(props: { team: Me['teams'][number]; userId: string; onOpen: (projectId: string) => void }) {
  const { team } = props;
  const url = `/teams/${team.id}/projects`;
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const canEdit = team.role !== 'viewer';
  const [showPresets, setShowPresets] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [creating, setCreating] = useState<{ templateId: string | null } | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('edited');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [ask, setAsk] = useState<(AskSpec & { done: (v: string | null) => void }) | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void api<ProjectRow[]>('GET', url).then(setRows);
  }, [url, reload]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(t);
  }, [note]);

  const askFor = (spec: AskSpec) => new Promise<string | null>((done) => setAsk({ ...spec, done }));
  const link = (id: string) => `${location.origin}${location.pathname}#/t/${team.id}/p/${id}`;
  const fail = () => setNote('That didn’t work. Try again.');

  async function rename(row: ProjectRow) {
    const name = await askFor({ title: row.isTemplate ? 'Rename template' : 'Rename project', input: { label: 'Name', value: row.name }, confirm: 'Rename' });
    if (!name || name === row.name) return;
    try {
      await api('PATCH', `${url}/${row.id}`, { name });
      setReload((n) => n + 1);
    } catch {
      fail();
    }
  }

  /** T7.3: a full copy as a project (opened) or as a template (listed on top). */
  async function duplicate(row: ProjectRow, isTemplate: boolean) {
    const suggested = isTemplate && !row.isTemplate ? `${row.name} template` : `${row.name} (copy)`;
    const name = await askFor({
      title: isTemplate && !row.isTemplate ? 'Save as template' : row.isTemplate ? 'Duplicate template' : 'Duplicate project',
      message: isTemplate && !row.isTemplate ? 'A copy of this project becomes a template the team can start from. The project itself stays as it is.' : undefined,
      input: { label: isTemplate ? 'Template name' : 'Name of the copy', value: suggested.slice(0, 200) },
      confirm: isTemplate && !row.isTemplate ? 'Save template' : 'Duplicate',
    });
    if (!name) return;
    try {
      const p = await api<{ id: string }>('POST', `${url}/${row.id}/duplicate`, { name, isTemplate });
      if (isTemplate) {
        setReload((n) => n + 1);
        setNote(`Saved “${name}” as a template.`);
      } else props.onOpen(p.id);
    } catch {
      fail();
    }
  }

  async function remove(row: ProjectRow) {
    const ok = await askFor({
      title: row.isTemplate ? 'Delete template?' : 'Delete project?',
      message: `“${row.name}” and everything in it will be deleted for the whole team. This can’t be undone.`,
      confirm: row.isTemplate ? 'Delete template' : 'Delete project',
      danger: true,
    });
    if (ok === null) return;
    try {
      await api('DELETE', `${url}/${row.id}`);
      setReload((n) => n + 1);
      setNote(`Deleted “${row.name}”.`);
    } catch {
      fail();
    }
  }

  async function copyLink(row: ProjectRow) {
    try {
      await navigator.clipboard.writeText(link(row.id));
      setNote('Link copied.');
    } catch {
      window.prompt('Copy this link', link(row.id));
    }
  }

  function openMenu(row: ProjectRow, button: HTMLButtonElement) {
    menuButton.current = button;
    const r = button.getBoundingClientRect();
    const open: MenuItem[] = row.isTemplate
      ? canEdit
        ? [
            { label: 'Use template', onSelect: () => setCreating({ templateId: row.id }) },
            { label: 'Edit template', onSelect: () => props.onOpen(row.id) },
          ]
        : [{ label: 'View template', onSelect: () => props.onOpen(row.id) }]
      : [
          { label: 'Open', onSelect: () => props.onOpen(row.id) },
          { label: 'Open in new tab', onSelect: () => window.open(link(row.id), '_blank', 'noopener') },
        ];
    const edit: MenuItem[] = canEdit
      ? [
          { label: 'Rename…', separated: true, onSelect: () => void rename(row) },
          { label: 'Duplicate…', onSelect: () => void duplicate(row, row.isTemplate) },
          ...(row.isTemplate ? [] : [{ label: 'Save as template…', separated: true, onSelect: () => void duplicate(row, true) }]),
        ]
      : [];
    const share: MenuItem[] = [{ label: 'Copy link', separated: !canEdit || row.isTemplate, onSelect: () => void copyLink(row) }];
    const danger: MenuItem[] = canEdit ? [{ label: row.isTemplate ? 'Delete template…' : 'Delete…', danger: true, separated: true, onSelect: () => void remove(row) }] : [];
    setMenu({ x: r.right - 220, y: r.bottom + 4, title: row.name, items: [...open, ...edit, ...share, ...danger] });
  }
  const closeMenu = () => {
    setMenu(null);
    menuButton.current?.focus();
  };

  const projects = useMemo(() => shownProjects(rows?.filter((p) => !p.isTemplate) ?? [], query, sort), [rows, query, sort]);
  const allProjects = rows?.filter((p) => !p.isTemplate).length ?? 0;
  const templates = useMemo(() => shownProjects(rows?.filter((p) => p.isTemplate) ?? [], '', 'name'), [rows]);
  const more = (row: ProjectRow) => (
    <button type="button" className="sc-icon-btn sc-more" aria-label={`More actions for ${row.name}`} aria-haspopup="menu" title="More actions" onClick={(e) => openMenu(row, e.currentTarget)}>
      <Icon name="more" />
    </button>
  );

  return (
    <section className="sc-card sc-card--wide sc-home">
      <header className="sc-home__head">
        <div className="sc-home__title">
          <span className="sc-home__team">{team.name}</span>
          <h1>Projects</h1>
        </div>
        <span className="sc-home__tools">
          <button type="button" className="sc-btn" onClick={() => setShowTeam(true)}>
            Team
          </button>
          <button type="button" className="sc-btn" onClick={() => setShowPresets(true)}>
            Size presets
          </button>
          {canEdit && (
            <button type="button" className="sc-btn sc-btn--primary" onClick={() => setCreating({ templateId: null })}>
              <Icon name="plus" /> New project
            </button>
          )}
        </span>
      </header>

      {rows === null ? (
        <p className="sc-muted">Loading…</p>
      ) : (
        <>
          {templates.length > 0 && (
            <section className="sc-home__section" aria-labelledby="templates-title">
              <h2 id="templates-title">Start from a template</h2>
              <ul className="sc-tcards" aria-label="Templates">
                {templates.map((t) => (
                  <li key={t.id} className="sc-tcard" data-template={t.name}>
                    <button type="button" className="sc-tcard__main" onClick={() => (canEdit ? setCreating({ templateId: t.id }) : props.onOpen(t.id))} aria-label={canEdit ? `New project from ${t.name}` : `View template ${t.name}`}>
                      <span className={`sc-tile sc-tile--lg sc-tile--${tileColor(t.name)}`} aria-hidden="true">
                        {initialOf(t.name)}
                      </span>
                      <span className="sc-tcard__name">{t.name}</span>
                      <span className="sc-rows__meta">{canEdit ? 'Use template' : 'Template'}</span>
                    </button>
                    {more(t)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="sc-home__section" aria-labelledby="projects-title">
            <div className="sc-home__bar">
              <h2 id="projects-title">
                All projects <span className="sc-muted sc-home__count">{allProjects}</span>
              </h2>
              {allProjects > 0 && (
                <span className="sc-home__filters">
                  <label className="sc-search">
                    <Icon name="search" />
                    <input type="search" placeholder="Search projects" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </label>
                  <select aria-label="Sort projects" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="edited">Last edited</option>
                    <option value="name">Name</option>
                  </select>
                </span>
              )}
            </div>
            {allProjects === 0 ? (
              <div className="sc-empty">
                <p>{canEdit ? 'No projects yet.' : 'No projects yet. An editor of the team can create one.'}</p>
                {canEdit && (
                  <button type="button" className="sc-btn sc-btn--primary" onClick={() => setCreating({ templateId: null })}>
                    <Icon name="plus" /> New project
                  </button>
                )}
              </div>
            ) : projects.length === 0 ? (
              <div className="sc-empty">
                <p>No projects match “{query.trim()}”.</p>
                <button type="button" className="sc-btn" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            ) : (
              <ul className="sc-list sc-rows" aria-label="Projects">
                {projects.map((p) => (
                  <li key={p.id} data-project={p.name}>
                    <button type="button" className="sc-rows__main sc-rows__main--tile" onClick={() => props.onOpen(p.id)} aria-label={p.name} aria-describedby={`edited-${p.id}`}>
                      <span className={`sc-tile sc-tile--${tileColor(p.name)}`} aria-hidden="true">
                        {initialOf(p.name)}
                      </span>
                      <span className="sc-rows__text">
                        <span className="sc-rows__name">{p.name}</span>
                        <time id={`edited-${p.id}`} className="sc-rows__meta" dateTime={p.updatedAt} title={new Date(p.updatedAt).toLocaleString()}>
                          Edited {timeAgo(p.updatedAt)}
                        </time>
                      </span>
                    </button>
                    {more(p)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {note && (
        <p className="sc-toast" role="status">
          {note}
        </p>
      )}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {ask && (
        <AskDialog
          ask={ask}
          onDone={(v) => {
            setAsk(null);
            ask.done(v);
          }}
        />
      )}
      {creating && rows && (
        <NewProjectDialog
          templates={templates}
          templateId={creating.templateId}
          onClose={() => setCreating(null)}
          onCreate={async (name, templateId) => {
            const p = await api<{ id: string }>('POST', url, { name, ...(templateId ? { templateId } : {}) });
            props.onOpen(p.id);
          }}
        />
      )}
      {showTeam && <TeamDialog teamId={team.id} teamName={team.name} userId={props.userId} isAdmin={team.role === 'admin'} onClose={() => setShowTeam(false)} />}
      {showPresets && <PresetsDialog teamId={team.id} isAdmin={team.role === 'admin'} onClose={() => setShowPresets(false)} />}
    </section>
  );
}

/** "+ New project": a name, and what to start from — a blank board or one of the team's templates. */
function NewProjectDialog(props: { templates: readonly ProjectRow[]; templateId: string | null; onClose: () => void; onCreate: (name: string, templateId: string | null) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState<string | null>(props.templateId);
  const start = props.templates.find((t) => t.id === props.templateId);
  const [name, setName] = useState(start ? start.name.replace(/ template$/i, '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await props.onCreate(name.trim(), from);
    } catch {
      setError('Could not create the project. Try again.');
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} className="sc-dialog" aria-labelledby="new-project-title" onCancel={props.onClose}>
      <form className="sc-card sc-ask sc-newproj" onSubmit={submit}>
        <h2 id="new-project-title">New project</h2>
        <label className="sc-field sc-field--col">
          Name
          <input placeholder="New project name" value={name} autoFocus maxLength={200} required onChange={(e) => setName(e.target.value)} />
        </label>
        {props.templates.length > 0 && (
          <fieldset className="sc-newproj__from">
            <legend>Start from</legend>
            <label className="sc-check">
              <input type="radio" name="from" checked={from === null} onChange={() => setFrom(null)} /> Blank board
            </label>
            {props.templates.map((t) => (
              <label key={t.id} className="sc-check">
                <input type="radio" name="from" checked={from === t.id} onChange={() => setFrom(t.id)} /> {t.name}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <div className="sc-form__actions">
          <button type="button" className="sc-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

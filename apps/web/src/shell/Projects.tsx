/**
 * The team's Projects screen (T16.2, owner-approved): templates as cards on top ("Start from a template"), then the
 * projects with search and sort, each row opening its project and carrying a ⋯ menu grouped the way real tools
 * do it — Open · Rename, Duplicate · Save as template, Copy link · Delete. "+ New project" asks for a name and
 * what to start from (a blank board or a template). Viewers see only what's safe for them (open, copy link).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type Me } from '../api';
import { ContextMenu, type MenuItem, type MenuState } from '../board/ContextMenu';
import { BRAND, BrandMark, PRODUCT_NAME } from '../ui/Brand';
import { Icon } from '../board/LayerRow';
import { AskDialog, type AskSpec } from '../ui/AskDialog';
import { PresetsDialog } from './PresetsDialog';
import { TeamDialog } from './TeamDialog';
import { DIALOG } from '../ui/tw';

interface ProjectRow {
  id: string;
  name: string;
  isTemplate: boolean;
  /** D64: when its thumbnail was stored (null: none yet). */
  thumbAt?: string | null;
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
/** A tile's colour: the --tile its tints are mixed from. */
const TILE_TONE: Record<(typeof TILE_COLORS)[number], string> = {
  blue: '[--tile:var(--type-input)]',
  purple: '[--tile:var(--type-main)]',
  green: '[--tile:var(--type-output)]',
  orange: '[--tile:var(--type-process)]',
  red: '[--tile:var(--danger)]',
  grey: '[--tile:var(--muted)]',
};
/** Where a tile sits: the team chip, a template card, or a project row (a big cover). */
type TileSpot = 'chip' | 'card' | 'row';
const TILE_SHAPE: Record<TileSpot, string> = {
  chip: 'size-26 rounded-[8px] text-[12px] font-[700]',
  card: 'size-44 rounded-[12px] text-[18px] font-[700] [grid-row:span_2]',
  row: 'aspect-[16/10] h-auto w-full text-[44px] font-[800] tracking-[-0.04em] border-b border-b-[color-mix(in_srgb,var(--line)_70%,transparent)]',
};
/** A tile's classes: the initial on a tint of its colour, or (`thumb`) a stored thumbnail. */
function tileClass(spot: TileSpot, tone: (typeof TILE_COLORS)[number] | 'thumb') {
  const base = `grid flex-none place-items-center ${TILE_SHAPE[spot]}`;
  if (tone === 'thumb') {
    const back = spot === 'row' ? 'p-14 [background:var(--cover-backdrop)]' : 'p-0 [background:var(--canvas,var(--surface-2))]';
    return `sc-tile sc-tile--thumb${spot === 'card' ? ' sc-tile--lg' : ''} [--tile:var(--muted)] overflow-hidden ${back} ${base} ${TILE_INK[spot]}`;
  }
  const tint = spot === 'row' ? TILE_COVER : 'bg-[color-mix(in_srgb,var(--tile)_16%,var(--surface))]';
  return `sc-tile${spot === 'card' ? ' sc-tile--lg' : ''} sc-tile--${tone} ${TILE_TONE[tone]} ${tint} ${base} ${TILE_INK[spot]}`;
}
const TILE_INK: Record<TileSpot, string> = {
  chip: 'text-[color:color-mix(in_srgb,var(--tile)_80%,var(--fg))]',
  card: 'text-[color:color-mix(in_srgb,var(--tile)_80%,var(--fg))]',
  row: 'text-[color:color-mix(in_srgb,var(--tile)_75%,var(--fg))]',
};
/** A project row's cover without a thumbnail: a light and a gradient in the tile's colour. */
const TILE_COVER =
  '[background:radial-gradient(120%_90%_at_20%_10%,color-mix(in_srgb,var(--tile)_34%,var(--surface)),transparent_60%),linear-gradient(135deg,color-mix(in_srgb,var(--tile)_22%,var(--surface)),color-mix(in_srgb,var(--tile)_8%,var(--surface)))]';
/** A thumbnail inside its tile: the whole artwork in a row's cover, filling the tile in a template card. */
const THUMB_IMG: Record<'card' | 'row', string> = {
  card: 'pointer-events-none block size-full object-cover',
  row: 'pointer-events-none block size-full rounded-[4px] object-contain [filter:drop-shadow(0_6px_14px_rgb(0_0_0/0.18))_drop-shadow(0_1px_2px_rgb(0_0_0/0.12))] [transition:transform_var(--t-med)] group-hover/row:[transform:scale(1.03)] group-focus-within/row:[transform:scale(1.03)]',
};
/** The ⋯ button: in a template card's corner, or floating on a row's cover until the row is hovered (always on touch). */
const MORE: Record<'card' | 'row', string> = {
  card: 'sc-icon-btn sc-more absolute top-(--sp-2) right-(--sp-2) size-32 flex-none pointer-coarse:size-44',
  row: 'sc-icon-btn sc-more absolute top-10 right-10 size-32 flex-none rounded-[10px] bg-glass opacity-0 [backdrop-filter:blur(8px)] [box-shadow:var(--shadow-1)] [transition:opacity_var(--t-fast)] pointer-coarse:size-44 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100',
};
/** A section's heading: small capitals. */
const SECTION_TITLE = 'm-0 text-[13px] font-[650] tracking-[0.04em] text-muted uppercase';
/** “No projects yet” / “Nothing matches”. */
const EMPTY = 'sc-empty grid justify-items-center gap-12 rounded-[18px] border border-dashed border-line-strong bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] px-24 py-48 text-center text-muted';

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
  const more = (row: ProjectRow, spot: 'card' | 'row') => (
    <button type="button" className={MORE[spot]} aria-label={`More actions for ${row.name}`} aria-haspopup="menu" title="More actions" onClick={(e) => openMenu(row, e.currentTarget)}>
      <Icon name="more" />
    </button>
  );

  return (
    <main className="sc-home mx-auto my-0 max-w-[1180px] px-28 pt-18 pb-64 max-md:min-h-dvh max-md:[align-content:start] max-md:px-12 max-md:pt-10 max-md:pb-40">
      <nav className="sc-home__nav flex h-56 items-center gap-14 rounded-[16px] border border-[color-mix(in_srgb,var(--line)_80%,transparent)] bg-glass py-0 pr-10 pl-14 [backdrop-filter:blur(16px)] [box-shadow:var(--shadow-2)]" aria-label="App">
        <span className={BRAND}>
          <BrandMark />
          {PRODUCT_NAME}
        </span>
        <span className="sc-home__team-chip ml-4 inline-flex items-center gap-8 border-l border-l-line py-4 pr-10 pl-14 font-[500] text-muted max-md:hidden" title="Your team">
          <span className={tileClass('chip', tileColor(team.name))} aria-hidden="true">
            {initialOf(team.name)}
          </span>
          {team.name}
        </span>
        <span className="sc-home__tools ml-auto flex gap-4">
          <button type="button" className="sc-btn sc-btn--quiet" onClick={() => setShowTeam(true)}>
            Team
          </button>
          <button type="button" className="sc-btn sc-btn--quiet" onClick={() => setShowPresets(true)}>
            Size presets
          </button>
        </span>
      </nav>
      <header className="sc-home__head mx-4 mt-40 mb-8 flex flex-wrap items-end justify-between gap-x-(--sp-3) gap-y-(--sp-2) max-md:mt-24">
        <div className="sc-home__title grid gap-6">
          <span className="sc-home__team hidden text-sm font-[500] text-muted">{team.name}</span>
          <h1 className="m-0 text-[36px] leading-[1.1] font-[750] tracking-[-0.03em] max-md:text-[28px]">Projects</h1>
          <p className="sc-muted sc-home__lede m-0 text-[15px]">Every campaign, every size. Open a board or start a new one.</p>
        </div>
        {canEdit && (
          <button type="button" className="sc-btn sc-btn--primary sc-home__new-btn h-44 gap-8 rounded-[12px] px-22 py-0 text-[14px] [box-shadow:0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent),inset_0_1px_0_rgb(255_255_255/0.15)]" onClick={() => setCreating({ templateId: null })}>
            <Icon name="plus" /> New project
          </button>
        )}
      </header>

      {rows === null ? (
        <p className="sc-muted">Loading…</p>
      ) : (
        <>
          {templates.length > 0 && (
            <section className="sc-home__section mt-32 grid gap-14" aria-labelledby="templates-title">
              <h2 id="templates-title" className={SECTION_TITLE}>Start from a template</h2>
              <ul className="sc-tcards m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-14 p-0" aria-label="Templates">
                {templates.map((t) => (
                  <li key={t.id} className="sc-tcard relative rounded-[16px] border border-line bg-surface [box-shadow:var(--shadow-1)] [transition:transform_var(--t-med),box-shadow_var(--t-med)] hover:border-line-strong hover:[transform:translateY(-2px)] hover:[box-shadow:var(--shadow-3)]" data-template={t.name}>
                    <button type="button" className="sc-tcard__main grid w-full grid-cols-[auto_1fr] items-center justify-items-start gap-x-12 gap-y-(--sp-1) rounded-[inherit] py-14 pr-44 pl-14 text-left text-inherit [background:none] [border:0]" onClick={() => (canEdit ? setCreating({ templateId: t.id }) : props.onOpen(t.id))} aria-label={canEdit ? `New project from ${t.name}` : `View template ${t.name}`}>
                      <Cover teamId={team.id} row={t} spot="card" />
                      <span className="sc-tcard__name max-w-full font-[600] [overflow-wrap:anywhere]">{t.name}</span>
                      <span className="sc-rows__meta">{canEdit ? 'Use template' : 'Template'}</span>
                    </button>
                    {more(t, 'card')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="sc-home__section mt-32 grid gap-14" aria-labelledby="projects-title">
            <div className="sc-home__bar flex flex-wrap items-center justify-between gap-(--sp-2)">
              <h2 id="projects-title" className={SECTION_TITLE}>
                All projects <span className="sc-muted sc-home__count ml-4 rounded-[99px] bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] px-8 py-1 text-[11px] font-[500] tracking-[0] text-fg">{allProjects}</span>
              </h2>
              {allProjects > 0 && (
                <span className="sc-home__filters flex flex-wrap gap-(--sp-2)">
                  <label className="sc-search flex h-38 items-center gap-6 rounded-[10px] border border-line bg-surface px-12 text-muted [box-shadow:var(--shadow-1)] focus-within:border-accent focus-within:[box-shadow:0_0_0_3px_var(--ring)]">
                    <Icon name="search" />
                    <input className="w-[220px] min-w-0 rounded-none px-0 py-6 [border:0] text-fg [background:none] [outline:none] max-md:w-full" type="search" placeholder="Search projects" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </label>
                  <select className="h-38 rounded-[10px] border border-line bg-surface px-8 py-6 text-fg [box-shadow:var(--shadow-1)] [font:inherit]" aria-label="Sort projects" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="edited">Last edited</option>
                    <option value="name">Name</option>
                  </select>
                </span>
              )}
            </div>
            {allProjects === 0 ? (
              <div className={EMPTY}>
                <p>{canEdit ? 'No projects yet.' : 'No projects yet. An editor of the team can create one.'}</p>
                {canEdit && (
                  <button type="button" className="sc-btn sc-btn--primary" onClick={() => setCreating({ templateId: null })}>
                    <Icon name="plus" /> New project
                  </button>
                )}
              </div>
            ) : projects.length === 0 ? (
              <div className={EMPTY}>
                <p>No projects match “{query.trim()}”.</p>
                <button type="button" className="sc-btn" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            ) : (
              <ul className="sc-list sc-rows" aria-label="Projects">
                {projects.map((p) => (
                  <li key={p.id} className="group/row" data-project={p.name}>
                    <button type="button" className="sc-rows__main sc-rows__main--tile" onClick={() => props.onOpen(p.id)} aria-label={p.name} aria-describedby={`edited-${p.id}`}>
                      <Cover teamId={team.id} row={p} spot="row" />
                      <span className="sc-rows__text">
                        <span className="sc-rows__name">{p.name}</span>
                        <time id={`edited-${p.id}`} className="sc-rows__meta" dateTime={p.updatedAt} title={new Date(p.updatedAt).toLocaleString()}>
                          Edited {timeAgo(p.updatedAt)}
                        </time>
                      </span>
                    </button>
                    {more(p, 'row')}
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
    </main>
  );
}

/** The card's picture: the project's thumbnail (D64) once the board has stored one, else its colour and letter. */
function Cover(props: { teamId: string; row: ProjectRow; spot: 'card' | 'row' }) {
  const { row, spot } = props;
  const [failed, setFailed] = useState(false);
  if (row.thumbAt && !failed) {
    return (
      <span className={tileClass(spot, 'thumb')} aria-hidden="true">
        <img className={THUMB_IMG[spot]} src={`/api/teams/${props.teamId}/projects/${row.id}/thumbnail?v=${encodeURIComponent(row.thumbAt)}`} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={tileClass(spot, tileColor(row.name))} aria-hidden="true">
      {initialOf(row.name)}
    </span>
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
    <dialog ref={ref} className={DIALOG} aria-labelledby="new-project-title" onCancel={props.onClose}>
      <form className="sc-card sc-ask sc-newproj grid" onSubmit={submit}>
        <h1 id="new-project-title">New project</h1>
        <label className="sc-field sc-field--col">
          Name
          <input placeholder="New project name" value={name} autoFocus maxLength={200} required onChange={(e) => setName(e.target.value)} />
        </label>
        {props.templates.length > 0 && (
          <fieldset className="sc-newproj__from m-0 grid gap-6 p-0 [border:0]">
            <legend className="mb-4 text-sm text-muted">Start from</legend>
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
          <p className="sc-error m-0" role="alert">
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

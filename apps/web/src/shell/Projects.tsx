import { useEffect, useState, type FormEvent } from 'react';
import { api, type Me } from '../api';
import { PresetsDialog } from './PresetsDialog';
import { TeamDialog } from './TeamDialog';

interface ProjectRow {
  id: string;
  name: string;
  isTemplate: boolean;
  updatedAt: string;
}

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

export function Projects(props: { team: Me['teams'][number]; userId: string; onOpen: (projectId: string) => void }) {
  const { team } = props;
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const canEdit = team.role !== 'viewer';
  const [showPresets, setShowPresets] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    void api<ProjectRow[]>('GET', `/teams/${team.id}/projects`).then(setRows);
  }, [team.id, reload]);

  /** T7.3: copy a project (or template) into a new one; opens the copy unless it is a template. */
  async function duplicate(row: ProjectRow, isTemplate: boolean) {
    const suggested = isTemplate && !row.isTemplate ? `${row.name} template` : `${row.name} (copy)`;
    const name = window.prompt(isTemplate ? 'Template name' : 'Name of the copy', suggested.slice(0, 200));
    if (!name?.trim()) return;
    const p = await api<{ id: string }>('POST', `/teams/${team.id}/projects/${row.id}/duplicate`, { name: name.trim(), isTemplate });
    if (isTemplate) setReload((n) => n + 1);
    else props.onOpen(p.id);
  }

  async function fromTemplate(row: ProjectRow) {
    const name = window.prompt('New project name', row.name.replace(/ template$/i, ''));
    if (!name?.trim()) return;
    const p = await api<{ id: string }>('POST', `/teams/${team.id}/projects`, { name: name.trim(), templateId: row.id });
    props.onOpen(p.id);
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    const p = await api<{ id: string }>('POST', `/teams/${team.id}/projects`, { name });
    form.reset();
    props.onOpen(p.id);
  }

  const projects = rows?.filter((p) => !p.isTemplate) ?? [];
  const templates = rows?.filter((p) => p.isTemplate) ?? [];

  return (
    <section className="sc-card sc-card--wide sc-home">
      <header className="sc-home__head">
        <h1>
          <span className="sc-home__team">
            {team.name}
            <span className="sc-home__sep"> · </span>
          </span>
          Projects
        </h1>
        <span className="sc-home__tools">
          <button type="button" className="sc-btn" onClick={() => setShowTeam(true)}>
            Team
          </button>
          <button type="button" className="sc-btn" onClick={() => setShowPresets(true)}>
            Size presets
          </button>
        </span>
      </header>
      {canEdit && (
        <form className="sc-home__new" onSubmit={create}>
          <input name="name" placeholder="New project name" aria-label="New project name" required maxLength={200} />
          <button type="submit" className="sc-btn sc-btn--primary">
            Create project
          </button>
        </form>
      )}
      {rows === null ? (
        <p className="sc-muted">Loading…</p>
      ) : (
        <>
          {projects.length === 0 ? (
            <p className="sc-empty">{canEdit ? 'No projects yet. Name one above to start.' : 'No projects yet.'}</p>
          ) : (
            <ul className="sc-list sc-rows" aria-label="Projects">
              {projects.map((p) => (
                <li key={p.id} data-project={p.name}>
                  <button type="button" className="sc-rows__main" onClick={() => props.onOpen(p.id)} aria-label={p.name} aria-describedby={`edited-${p.id}`}>
                    <span className="sc-rows__name">{p.name}</span>
                    <time id={`edited-${p.id}`} className="sc-rows__meta" dateTime={p.updatedAt} title={new Date(p.updatedAt).toLocaleString()}>
                      Edited {timeAgo(p.updatedAt)}
                    </time>
                  </button>
                  {canEdit && (
                    <span className="sc-rows__actions">
                      <button type="button" className="sc-btn sc-btn--ghost" onClick={() => void duplicate(p, false)} aria-label={`Duplicate ${p.name}`}>
                        Duplicate
                      </button>
                      <button type="button" className="sc-btn sc-btn--ghost" onClick={() => void duplicate(p, true)} aria-label={`Save ${p.name} as template`} title="Save a copy as a template">
                        Make template
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {templates.length > 0 && (
            <>
              <h2>Templates</h2>
              <ul className="sc-list sc-rows" aria-label="Templates">
                {templates.map((p) => (
                  <li key={p.id} data-template={p.name}>
                    <span className="sc-rows__main">
                      <span className="sc-rows__name">{p.name}</span>
                    </span>
                    {canEdit && (
                      <span className="sc-rows__actions">
                        <button type="button" className="sc-btn sc-btn--ghost" onClick={() => props.onOpen(p.id)} aria-label={`Edit template ${p.name}`}>
                          Edit
                        </button>
                        <button type="button" className="sc-btn" onClick={() => void fromTemplate(p)} aria-label={`New project from ${p.name}`}>
                          Use template
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {showTeam && (
        <TeamDialog teamId={team.id} teamName={team.name} userId={props.userId} isAdmin={team.role === 'admin'} onClose={() => setShowTeam(false)} />
      )}
      {showPresets && <PresetsDialog teamId={team.id} isAdmin={team.role === 'admin'} onClose={() => setShowPresets(false)} />}
    </section>
  );
}

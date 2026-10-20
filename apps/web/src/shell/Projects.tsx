import { useEffect, useState, type FormEvent } from 'react';
import { api, type Me } from '../api';
import { PresetsDialog } from './PresetsDialog';

interface ProjectRow {
  id: string;
  name: string;
  isTemplate: boolean;
  updatedAt: string;
}

export function Projects(props: { team: Me['teams'][number]; onOpen: (projectId: string) => void }) {
  const { team } = props;
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const canEdit = team.role !== 'viewer';
  const [showPresets, setShowPresets] = useState(false);
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

  return (
    <section className="sc-card sc-card--wide">
      <div className="sc-row sc-row--between">
        <h1>{team.name} · Projects</h1>
        <button type="button" onClick={() => setShowPresets(true)}>
          Size presets
        </button>
      </div>
      {canEdit && (
        <form className="sc-row" onSubmit={create}>
          <input name="name" placeholder="New project name" required maxLength={200} />
          <button type="submit">Create</button>
        </form>
      )}
      {rows === null ? (
        <p className="sc-muted">Loading…</p>
      ) : (
        <>
          {rows.filter((p) => !p.isTemplate).length === 0 ? (
            <p className="sc-muted">No projects yet.</p>
          ) : (
            <ul className="sc-list" aria-label="Projects">
              {rows
                .filter((p) => !p.isTemplate)
                .map((p) => (
                  <li key={p.id} data-project={p.name}>
                    <button type="button" className="sc-link" onClick={() => props.onOpen(p.id)}>
                      {p.name}
                    </button>
                    <span className="sc-muted">{new Date(p.updatedAt).toLocaleString()}</span>
                    {canEdit && (
                      <span className="sc-row">
                        <button type="button" onClick={() => void duplicate(p, false)} aria-label={`Duplicate ${p.name}`}>
                          Duplicate
                        </button>
                        <button type="button" onClick={() => void duplicate(p, true)} aria-label={`Save ${p.name} as template`}>
                          Save as template
                        </button>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {rows.some((p) => p.isTemplate) && (
            <>
              <h2>Templates</h2>
              <ul className="sc-list" aria-label="Templates">
                {rows
                  .filter((p) => p.isTemplate)
                  .map((p) => (
                    <li key={p.id} data-template={p.name}>
                      <span>{p.name}</span>
                      {canEdit && (
                        <span className="sc-row">
                          <button type="button" onClick={() => void fromTemplate(p)} aria-label={`New project from ${p.name}`}>
                            Use template
                          </button>
                          <button type="button" onClick={() => props.onOpen(p.id)} aria-label={`Edit template ${p.name}`}>
                            Edit
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
      {showPresets && <PresetsDialog teamId={team.id} isAdmin={team.role === 'admin'} onClose={() => setShowPresets(false)} />}
    </section>
  );
}

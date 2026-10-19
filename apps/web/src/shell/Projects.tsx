import { useEffect, useState, type FormEvent } from 'react';
import { api, type Me } from '../api';
import { PresetsDialog } from './PresetsDialog';

interface ProjectRow {
  id: string;
  name: string;
  updatedAt: string;
}

export function Projects(props: { team: Me['teams'][number]; onOpen: (projectId: string) => void }) {
  const { team } = props;
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const canEdit = team.role !== 'viewer';
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    void api<ProjectRow[]>('GET', `/teams/${team.id}/projects`).then(setRows);
  }, [team.id]);

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
      ) : rows.length === 0 ? (
        <p className="sc-muted">No projects yet.</p>
      ) : (
        <ul className="sc-list">
          {rows.map((p) => (
            <li key={p.id}>
              <button type="button" className="sc-link" onClick={() => props.onOpen(p.id)}>
                {p.name}
              </button>
              <span className="sc-muted">{new Date(p.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {showPresets && <PresetsDialog teamId={team.id} isAdmin={team.role === 'admin'} onClose={() => setShowPresets(false)} />}
    </section>
  );
}

/**
 * D62 project history: the project's kept versions, newest first, grouped by day. A tap shows one read-only on the
 * board (the preview bar has Restore); editors can name the project as it is now, and delete a named version.
 * The list comes from the API, which keeps versions on save by itself; this panel only reads and names them.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Icon } from './LayerRow';
import { LIST_DAY, LIST_DAY_TITLE, LIST_NOTE, LIST_OPEN, LIST_ROWS, LIST_TITLE, listItem, PANEL_HEAD, panelClass, SECTION } from './panel';

export type VersionKind = 'auto' | 'before-delete' | 'before-restore' | 'named';
export interface Version {
  id: string;
  rev: number;
  kind: VersionKind;
  label: string;
  createdAt: string;
  by: string | null;
}

/** What a version is, as the list and the preview bar say it. */
export function versionTitle(v: Pick<Version, 'kind' | 'label'>): string {
  if (v.kind === 'named') return v.label;
  if (v.kind === 'before-delete') return `Before deleting ${v.label}`;
  if (v.kind === 'before-restore') return 'Before restore';
  return 'Auto-saved';
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** "Today", "Yesterday" or the date, for the day headings. */
export function dayOf(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** The preview bar's "Version from …" text. */
export const versionWhen = (v: Pick<Version, 'createdAt'>) => `${dayOf(v.createdAt)}, ${time(v.createdAt)}`;

export function HistoryPanel(props: {
  url: string;
  /** Viewers see and preview versions; they can't name or delete them. */
  readOnly: boolean;
  /** The version shown on the board, if any. */
  previewing: string | null;
  /** Bumped when the history may have changed (a restore, a reload). */
  refresh: number;
  floating?: 'overlay' | 'sheet';
  onView: (v: Version) => void;
  /** Saves pending edits first, so a named version is the board as it is now. */
  flush: () => Promise<void>;
  onClose: () => void;
}) {
  const { url } = props;
  const [list, setList] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api<Version[]>('GET', `${url}/versions`).then(
      (l) => live && setList(l),
      () => live && setError('Could not load the history.'),
    );
    return () => {
      live = false;
    };
  }, [url, props.refresh, reload]);

  async function name(e: React.FormEvent) {
    e.preventDefault();
    const label = naming.trim();
    if (!label) return;
    setError(null);
    try {
      await props.flush();
      await api('POST', `${url}/versions`, { label });
      setNaming('');
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'A project keeps up to 50 named versions. Delete one first.' : 'Could not save the version.');
    }
  }
  async function remove(v: Version) {
    if (!window.confirm(`Delete the version “${v.label}”?`)) return;
    await api('DELETE', `${url}/versions/${v.id}`).catch(() => setError('Could not delete the version.'));
    setReload((n) => n + 1);
  }

  const days: { day: string; versions: Version[] }[] = [];
  for (const v of list ?? []) {
    const day = dayOf(v.createdAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.versions.push(v);
    else days.push({ day, versions: [v] });
  }
  const { floating } = props;
  return (
    <aside className={panelClass(floating, 'sc-history')} aria-label="History">
      <div className={PANEL_HEAD}>
        <span>History</span>
        <button type="button" className="sc-icon-btn" onClick={props.onClose} aria-label="Close history" title="Close">
          <Icon name="close" />
        </button>
      </div>
      {!props.readOnly && !props.previewing && (
        <form className={`${SECTION} sc-history__name grid-cols-[1fr_auto] items-center`} onSubmit={(e) => void name(e)}>
          <input aria-label="Version name" placeholder="e.g. Sent to client" maxLength={100} value={naming} onChange={(e) => setNaming(e.target.value)} />
          <button type="submit" className="sc-btn" disabled={!naming.trim()}>
            Save version
          </button>
        </form>
      )}
      {error && (
        <p className={`sc-error ${LIST_NOTE}`} role="alert">
          {error}
        </p>
      )}
      {list === null && !error && <p className={`sc-muted ${LIST_NOTE}`}>Loading…</p>}
      {list?.length === 0 && <p className={`sc-muted ${LIST_NOTE}`}>No earlier versions yet. One is kept every 10 minutes while you edit, and before panels are deleted.</p>}
      {days.map(({ day, versions }) => (
        <section key={day} className={LIST_DAY} aria-label={day}>
          <h3 className={LIST_DAY_TITLE}>{day}</h3>
          <ul className={LIST_ROWS}>
            {versions.map((v) => (
              <li key={v.id} className={listItem(v.id === props.previewing)}>
                <button type="button" className={LIST_OPEN} aria-current={v.id === props.previewing || undefined} onClick={() => props.onView(v)}>
                  <span className={LIST_TITLE}>{versionTitle(v)}</span>
                  <span className="sc-muted">
                    {time(v.createdAt)}
                    {v.by ? ` · ${v.by}` : ''}
                  </span>
                </button>
                {v.kind === 'named' && !props.readOnly && (
                  <button type="button" className="sc-icon-btn" aria-label={`Delete version ${v.label}`} title="Delete" onClick={() => void remove(v)}>
                    <Icon name="trash" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

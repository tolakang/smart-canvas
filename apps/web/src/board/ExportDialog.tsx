/**
 * Export dialog (D22, screen 8; T6.5): pick outputs, format and options, start one job per output and
 * watch each one's progress and errors while the worker renders them.
 */
import { EXPORT_FORMATS, type ExportFormat, type ExportJob, type ExportOptions, type ProjectDoc } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

const FORMAT_LABEL: Record<ExportFormat, string> = { png: 'PNG', jpg: 'JPG', webp: 'WebP', pdf: 'PDF (vector)', svg: 'SVG (live text)' };
const POLL_MS = 1000;

export function ExportDialog(props: { teamId: string; projectId: string; doc: ProjectDoc; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { doc } = props;
  const base = `/teams/${props.teamId}/projects/${props.projectId}/exports`;
  const [selected, setSelected] = useState<string[]>(() => doc.outputs.map((o) => o.id));
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(90);
  const [cropMarks, setCropMarks] = useState(true);
  const [withBleed, setWithBleed] = useState(true);
  const [jobs, setJobs] = useState<ExportJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Poll the started jobs until every one has finished.
  const pending = jobs?.some((j) => j.status === 'queued' || j.status === 'running') ?? false;
  const ids = jobs?.map((j) => j.id).join(',') ?? '';
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => {
      api<ExportJob[]>('GET', `${base}?ids=${ids}`).then(
        (fresh) => setJobs((cur) => cur?.map((j) => fresh.find((f) => f.id === j.id) ?? j) ?? null),
        () => undefined,
      );
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, ids, base]);

  const hasBleed = doc.outputs.some((o) => selected.includes(o.id) && (o.bleedMm ?? 0) > 0);
  const options = (): ExportOptions => ({
    ...(format === 'jpg' || format === 'webp' ? { quality } : {}),
    ...(format === 'pdf' && hasBleed ? { cropMarks } : {}),
    ...(hasBleed ? { withBleed } : {}),
  });

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setJobs(await api<ExportJob[]>('POST', base, { outputIds: selected, format, options: options() }));
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { error?: string; messages?: string[] } | null) : null;
      setError(body?.messages?.join(' · ') ?? (err instanceof ApiError && err.status === 403 ? 'Viewers cannot export.' : 'Export could not start.'));
    } finally {
      setBusy(false);
    }
  }

  const label = (id: string) => doc.outputs.find((o) => o.id === id)?.label ?? id;
  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="export-title">
      <div className="sc-card sc-export">
        <h1 id="export-title">Export</h1>
        {jobs === null ? (
          <form onSubmit={start}>
            <fieldset className="sc-export__outputs">
              <legend>Outputs</legend>
              {doc.outputs.length === 0 && <p className="sc-muted">Add an output first.</p>}
              {doc.outputs.map((o) => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))}
                  />
                  {o.label} <span className="sc-muted">{o.size.width} × {o.size.height} {o.size.unit}</span>
                </label>
              ))}
            </fieldset>
            <label>
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            {(format === 'jpg' || format === 'webp') && (
              <label>
                Quality
                <input type="number" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value) || 90)} />
              </label>
            )}
            {hasBleed && (
              <label className="sc-check">
                <input type="checkbox" checked={withBleed} onChange={(e) => setWithBleed(e.target.checked)} /> Include bleed (print outputs)
              </label>
            )}
            {format === 'pdf' && hasBleed && (
              <label className="sc-check">
                <input type="checkbox" checked={cropMarks} onChange={(e) => setCropMarks(e.target.checked)} /> Crop marks
              </label>
            )}
            {error && (
              <p className="sc-error" role="alert">
                {error}
              </p>
            )}
            <div className="sc-row">
              <button type="submit" disabled={busy || selected.length === 0}>
                Export {selected.length} {selected.length === 1 ? 'output' : 'outputs'}
              </button>
              <button type="button" onClick={() => ref.current?.close()}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <ul className="sc-export__jobs" aria-label="Export progress">
              {jobs.map((j) => (
                <li key={j.id} data-status={j.status}>
                  <span>
                    {label(j.outputIds[0] ?? '')} <span className="sc-muted">· {j.format.toUpperCase()}</span>
                  </span>
                  <progress max={1} value={j.progress} aria-label={`${label(j.outputIds[0] ?? '')} progress`} />
                  <span className={j.status === 'failed' ? 'sc-error' : 'sc-muted'}>{j.status === 'failed' ? (j.error ?? 'Failed') : j.status}</span>
                </li>
              ))}
            </ul>
            <div className="sc-row">
              <button type="button" onClick={() => ref.current?.close()}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

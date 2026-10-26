/**
 * Export dialog (D22, screen 8; T6.5): pick outputs, format and options; watch each file's progress and
 * errors; download each file or all as a ZIP (T6.6).
 * D31 hybrid (T11.1): each file is made in the user's browser when exportRoute allows it and the browser
 * passes the feature check, else by the export worker; a file that fails in the browser is made on the
 * server instead. "Download all" zips every finished file in the browser. N6: from a Preset node, its sizes only
 * (hidden Previews included unless unticked), downloaded as one ZIP named by its family once all are done.
 * M6: a multi-file export too large to zip in the browser (zipOnServer) is made on the server, and when every
 * finished file is a server file, "Download all" is the API's streamed ZIP instead of one built here.
 */
import {
  EXPORT_FORMATS,
  exportCapError,
  exportFileName,
  exportPixelTotal,
  exportRoute,
  exportZipName,
  LIMITS,
  presetSets,
  type ExportFormat,
  type ExportJob,
  type ExportOptions,
  type LayoutDeps,
  type ProjectDoc,
  zipOnServer,
} from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { approvalOf, type ApprovalState } from './review';
import { api, ApiError, assetUrl } from '../api';
import { exportInBrowser, type BrowserFormat } from '../render/browserExport';
import { browserExportSupported } from '../render/exportFile';
import { zipStore } from '../ui/zip';
import { DIALOG, DIALOG_SELECT } from '../ui/tw';

/** “2 of 3 chosen Previews aren’t approved”, with its Only approved button on the right. */
const APPROVAL = 'sc-export__approval m-0 flex flex-wrap items-center gap-8 rounded-sm border-l-3 border-l-warn bg-surface-2 px-10 py-8 text-sm [&>button]:ml-auto';

const FORMAT_LABEL: Record<ExportFormat, string> = { png: 'PNG', jpg: 'JPG', webp: 'WebP', pdf: 'PDF (vector)', svg: 'SVG' };
const POLL_MS = 1000;
const API_BASE = '/api';

/** One file being made: in the browser (blob) or by a server job. */
interface Row {
  outputId: string;
  where: 'browser' | 'server';
  status: ExportJob['status'];
  progress: number;
  error?: string;
  jobId?: string;
  /** Browser files: object URL of the finished blob. */
  url?: string;
  blob?: Blob;
  /** Made on the server after the browser failed. */
  fellBack?: boolean;
}

export function ExportDialog(props: {
  teamId: string;
  projectId: string;
  doc: ProjectDoc;
  layoutDeps: LayoutDeps | null;
  /** D63: approved Previews' states; the dialog warns about chosen ones not approved (once the project uses approval). */
  approvals?: ReadonlyMap<string, ApprovalState>;
  initialOutputs?: string[];
  presetSet?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { doc } = props;
  /** N6: exporting a Preset node — its sizes only, hidden ones included unless unticked, one ZIP named by its family. */
  const set = props.presetSet ? presetSets(doc).find((s) => s.id === props.presetSet) : undefined;
  const hidden = new Set(set?.hidden ?? []);
  const listed = set ? set.outputs.flatMap((id) => doc.outputs.find((o) => o.id === id) ?? []) : doc.outputs;
  const base = `/teams/${props.teamId}/projects/${props.projectId}/exports`;
  const [selected, setSelected] = useState<string[]>(() => props.initialOutputs ?? doc.outputs.map((o) => o.id));
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(90);
  const [cropMarks, setCropMarks] = useState(true);
  const [withBleed, setWithBleed] = useState(true);
  const [outlineText, setOutlineText] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Poll the server jobs until every one has finished.
  const serverPending = rows?.filter((r) => r.where === 'server' && r.jobId && (r.status === 'queued' || r.status === 'running')) ?? [];
  const ids = serverPending.map((r) => r.jobId).join(',');
  useEffect(() => {
    if (!ids) return;
    const t = setInterval(() => {
      api<ExportJob[]>('GET', `${base}?ids=${ids}`).then(
        (fresh) =>
          setRows(
            (cur) =>
              cur?.map((r) => {
                const j = fresh.find((f) => f.id === r.jobId);
                return j ? { ...r, status: j.status, progress: j.progress, error: j.error } : r;
              }) ?? null,
          ),
        () => undefined,
      );
    }, POLL_MS);
    return () => clearInterval(t);
  }, [ids, base]);

  // Browser files hold object URLs until the dialog closes.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const patchRow = (outputId: string, patch: Partial<Row>) => setRows((cur) => cur?.map((r) => (r.outputId === outputId ? { ...r, ...patch } : r)) ?? null);

  const hasBleed = doc.outputs.some((o) => selected.includes(o.id) && (o.bleedMm ?? 0) > 0);
  const options = (): ExportOptions => ({
    ...(format === 'jpg' || format === 'webp' ? { quality } : {}),
    ...(format === 'pdf' && hasBleed ? { cropMarks } : {}),
    ...(format === 'svg' && outlineText ? { outlineText } : {}),
    ...(hasBleed ? { withBleed } : {}),
  });

  // T6.7: raster exports over the edge cap are blocked here (the API refuses them too).
  const chosen = doc.outputs.filter((o) => selected.includes(o.id));
  const serverZip = zipOnServer(chosen, format, options());
  const tooLarge = doc.outputs.flatMap((o) => (selected.includes(o.id) ? [exportCapError(o, format, options())] : [])).filter((m): m is string => !!m);

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const opts = options();
    const deps = props.layoutDeps;
    const inBrowser = deps && browserExportSupported() && !zipOnServer(chosen, format, opts);
    const where = (id: string) => {
      const o = doc.outputs.find((x) => x.id === id);
      return inBrowser && o && exportRoute(o, format, opts) === 'browser' ? 'browser' : 'server';
    };
    const order = doc.outputs.map((o) => o.id).filter((id) => selected.includes(id));
    const serverIds = order.filter((id) => where(id) === 'server');
    const startJobs = (outputIds: string[]) => api<ExportJob[]>('POST', base, { outputIds, format, options: opts });
    let started: ExportJob[] = [];
    try {
      if (serverIds.length) started = await startJobs(serverIds);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { error?: string; messages?: string[] } | null) : null;
      setError(body?.messages?.join(' · ') ?? (err instanceof ApiError && err.status === 403 ? 'Viewers cannot export.' : 'Export could not start.'));
      setBusy(false);
      return;
    }
    setBusy(false);
    const jobRow = (j: ExportJob, fellBack = false): Partial<Row> => ({ where: 'server', jobId: j.id, status: j.status, progress: j.progress, error: j.error, fellBack });
    setRows(
      order.map((id) => {
        const j = started.find((x) => x.outputIds[0] === id);
        return j ? ({ outputId: id, ...jobRow(j) } as Row) : { outputId: id, where: 'browser', status: 'queued', progress: 0 };
      }),
    );
    // Browser files one at a time (each one is a full-size render); a failure goes to the server.
    if (!deps) return;
    for (const id of order.filter((x) => where(x) === 'browser')) {
      patchRow(id, { status: 'running', progress: 0.3 });
      try {
        const file = await exportInBrowser({ doc, outputId: id, format: format as BrowserFormat, options: opts, layoutDeps: deps, assetUrl: (a) => assetUrl(props.teamId, a) });
        const url = URL.createObjectURL(file.blob);
        urls.current.push(url);
        patchRow(id, { status: 'done', progress: 1, url, blob: file.blob });
      } catch (err) {
        console.warn('Browser export failed; making it on the server instead.', err);
        try {
          const [j] = await startJobs([id]);
          patchRow(id, j ? jobRow(j, true) : { status: 'failed', progress: 1, error: 'Export could not start.' });
        } catch {
          patchRow(id, { status: 'failed', progress: 1, error: 'Export could not start.' });
        }
      }
    }
  }

  const fileName = (outputId: string) => {
    const o = doc.outputs.find((x) => x.id === outputId);
    return o ? exportFileName(doc.name, o, format, options()) : `${outputId}.${format}`;
  };
  const serverUrl = (r: Row) => `${API_BASE}/teams/${props.teamId}/exports/${r.jobId}/file`;

  /** Every finished file in one ZIP: the API's when all are server files (M6), else made here (browser blobs, server files fetched). */
  async function downloadAll(done: Row[]) {
    if (done.every((r) => r.jobId)) {
      const a = document.createElement('a');
      a.href = `${API_BASE}${base}/zip?ids=${done.map((r) => r.jobId).join(',')}${set ? `&set=${encodeURIComponent(set.id)}` : ''}`;
      a.download = exportZipName(doc.name, set?.label);
      a.click();
      return;
    }
    setZipping(true);
    try {
      const entries = await Promise.all(
        done.map(async (r) => {
          const blob = r.blob ?? (await (await fetch(serverUrl(r), { credentials: 'same-origin' })).blob());
          return { name: fileName(r.outputId), data: new Uint8Array(await blob.arrayBuffer()) };
        }),
      );
      const url = URL.createObjectURL(new Blob([zipStore(entries)], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = exportZipName(doc.name, set?.label);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError('Could not make the ZIP; download the files one by one.');
    } finally {
      setZipping(false);
    }
  }

  const done = rows?.filter((r) => r.status === 'done') ?? [];
  // N6: a Preset node's export downloads its ZIP once every size has finished.
  const finished = !!rows && rows.length > 0 && rows.every((r) => r.status === 'done' || r.status === 'failed');
  const zipped = useRef(false);
  useEffect(() => {
    if (!set || !finished || zipped.current || done.length === 0) return;
    zipped.current = true;
    void downloadAll(done);
  });
  const inBrowserNow = !!props.layoutDeps && browserExportSupported() && !serverZip;
  const plan = inBrowserNow
    ? doc.outputs.filter((o) => selected.includes(o.id)).reduce((n, o) => n + (exportRoute(o, format, options()) === 'browser' ? 1 : 0), 0)
    : 0;
  const label = (id: string) => doc.outputs.find((o) => o.id === id)?.label ?? id;
  // D63: a warning, never a block — and only once someone in the project approves Previews.
  const approvals = props.approvals ?? new Map<string, ApprovalState>();
  const isApproved = (id: string) => approvalOf(approvals, id).state === 'approved';
  const notApproved = approvals.size > 0 ? selected.filter((id) => !isApproved(id)) : [];
  const APPROVAL_NOTE = { approved: ' · approved', changed: ' · changed since approved', none: approvals.size > 0 ? ' · not approved' : '' } as const;
  return (
    <dialog ref={ref} className={DIALOG} onClose={props.onClose} aria-labelledby="export-title">
      <div className="sc-card sc-export">
        <h1 id="export-title">Export</h1>
        {rows === null ? (
          <form className="grid gap-10" onSubmit={start}>
            <fieldset className="sc-export__outputs grid max-h-[280px] gap-2 overflow-auto rounded-[12px] border border-line bg-surface-2 p-6">
              <legend className="px-6 text-[12px] font-[650] tracking-[0.04em] text-muted uppercase">Previews</legend>
              {listed.length === 0 && <p className="sc-muted">Add a Preview first.</p>}
              {listed.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-6 rounded-[9px] bg-surface px-10 py-8 [box-shadow:0_0_0_1px_color-mix(in_srgb,var(--line)_60%,transparent)] hover:[box-shadow:0_0_0_1px_var(--accent)] [label+&]:mt-4">
                  <input
                    type="checkbox"
                    className="size-16"
                    checked={selected.includes(o.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))}
                  />
                  {o.label}{' '}
                  <span className="sc-muted">
                    {o.size.width} × {o.size.height} {o.size.unit}
                    {hidden.has(o.id) ? ' · hidden on the board' : ''}
                    {APPROVAL_NOTE[approvalOf(approvals, o.id).state]}
                  </span>
                </label>
              ))}
            </fieldset>
            {set && hidden.size > 0 && (
              <label className="sc-check font-[500]">
                <input type="checkbox" checked={[...hidden].every((id) => selected.includes(id))} onChange={(e) => setSelected((s) => (e.target.checked ? [...s.filter((id) => !hidden.has(id)), ...hidden] : s.filter((id) => !hidden.has(id))))} /> Include hidden
                previews ({hidden.size})
              </label>
            )}
            <label className="font-[500]">
              Format
              <select className={DIALOG_SELECT} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            {(format === 'jpg' || format === 'webp') && (
              <label className="font-[500]">
                Quality
                <input type="number" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value) || 90)} />
              </label>
            )}
            {hasBleed && (
              <label className="sc-check font-[500]">
                <input type="checkbox" checked={withBleed} onChange={(e) => setWithBleed(e.target.checked)} /> Include bleed (print sizes)
              </label>
            )}
            {format === 'svg' && (
              <label className="sc-check font-[500]" title="Text becomes shapes: the SVG needs no fonts, but the text can't be edited">
                <input type="checkbox" checked={outlineText} onChange={(e) => setOutlineText(e.target.checked)} /> Outline text
              </label>
            )}
            {format === 'pdf' && hasBleed && (
              <label className="sc-check font-[500]">
                <input type="checkbox" checked={cropMarks} onChange={(e) => setCropMarks(e.target.checked)} /> Crop marks
              </label>
            )}
            {tooLarge.length > 0 && (
              <div className="sc-error" role="alert">
                <p>
                  Too large to export as {format.toUpperCase()} (max {LIMITS.maxExportEdgePx} px per side). Lower the output size, scale or DPI, or
                  export as PDF/SVG:
                </p>
                <ul>
                  {tooLarge.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.length > 0 && tooLarge.length === 0 && (
              <p className="sc-muted sc-export__where">
                {serverZip
                  ? `Large export (${Math.round(exportPixelTotal(chosen, format, options()) / 1e6)} million pixels): made and zipped on the server.`
                  : plan === selected.length
                  ? 'Made in your browser — fast, and no server time.'
                  : plan === 0
                    ? `Made on the server${format === 'pdf' ? ' (PDF)' : format === 'svg' && outlineText ? ' (outlined text)' : inBrowserNow ? ' (large files)' : ''}.`
                    : `${plan} made in your browser, ${selected.length - plan} on the server.`}
              </p>
            )}
            {notApproved.length > 0 && (
              <p className={APPROVAL} role="status">
                {notApproved.length} of {selected.length} chosen {selected.length === 1 ? 'Preview isn’t' : 'Previews aren’t'} approved.
                {selected.length > notApproved.length && (
                  <button type="button" onClick={() => setSelected((s) => s.filter(isApproved))}>
                    Only approved ({selected.length - notApproved.length})
                  </button>
                )}
              </p>
            )}
            {error && (
              <p className="sc-error" role="alert">
                {error}
              </p>
            )}
            <div className="sc-row">
              <button type="submit" disabled={busy || selected.length === 0 || tooLarge.length > 0}>
                Export {selected.length} {selected.length === 1 ? 'Preview' : 'Previews'}
              </button>
              <button type="button" onClick={() => ref.current?.close()}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <ul className="sc-export__jobs m-0 mb-12 grid list-none gap-8 p-0" aria-label="Export progress">
              {rows.map((r) => (
                <li key={r.outputId} className="grid grid-cols-[1fr_120px_1fr] items-center gap-8 rounded-[10px] bg-surface-2 px-10 py-8" data-status={r.status} data-where={r.where}>
                  <span>
                    {label(r.outputId)} <span className="sc-muted">· {format.toUpperCase()} · {r.where === 'browser' ? 'in your browser' : r.fellBack ? 'on the server (browser failed)' : 'on the server'}</span>
                  </span>
                  <progress max={1} value={r.progress} aria-label={`${label(r.outputId)} progress`} />
                  {r.status === 'done' ? (
                    <a href={r.url ?? serverUrl(r)} download={fileName(r.outputId)}>
                      Download
                    </a>
                  ) : (
                    <span className={r.status === 'failed' ? 'sc-error' : 'sc-muted'}>{r.status === 'failed' ? (r.error ?? 'Failed') : r.status}</span>
                  )}
                </li>
              ))}
            </ul>
            {notApproved.length > 0 && (
              <p className={APPROVAL} role="status">
                {notApproved.length} of {selected.length} chosen {selected.length === 1 ? 'Preview isn’t' : 'Previews aren’t'} approved.
                {selected.length > notApproved.length && (
                  <button type="button" onClick={() => setSelected((s) => s.filter(isApproved))}>
                    Only approved ({selected.length - notApproved.length})
                  </button>
                )}
              </p>
            )}
            {error && (
              <p className="sc-error" role="alert">
                {error}
              </p>
            )}
            <div className="sc-row">
              {(done.length > 1 || (set && done.length > 0)) && (
                <button type="button" className="sc-button" disabled={zipping} onClick={() => void downloadAll(done)}>
                  {zipping ? 'Making ZIP…' : set ? `Download ${set.label} (ZIP, ${done.length})` : `Download all (ZIP, ${done.length})`}
                </button>
              )}
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

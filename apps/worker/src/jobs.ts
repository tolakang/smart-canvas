/**
 * One export job = one output in one format (T6.5): load the row, render the output in Chromium,
 * export, store the file, and record status / progress / error on the row as it goes.
 */
import { exportCapError, exportStorageKey, renderScaleOf, withBleedOf, type ExportFormat, type ExportOptions, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { exportPdf } from './pdf';
import { exportRaster } from './raster';
import type { ApiFetch, RenderTarget } from './render';
import { exportSvg } from './svg';

export interface JobRow {
  id: string;
  projectId: string;
  teamId: string;
  outputIds: string[];
  format: ExportFormat;
  options: ExportOptions;
  status: 'queued' | 'running' | 'done' | 'failed';
}

export interface JobStore {
  load(id: string): Promise<JobRow | null>;
  update(id: string, patch: { status: JobRow['status']; progress: number; error?: string | null }): Promise<void>;
}

export interface FileStore {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
}

export interface ExportDeps {
  jobs: JobStore;
  api: ApiFetch;
  files: FileStore;
  /** Opens a ready render page (openRender bound to the browser and web URL). */
  render: (target: RenderTarget) => Promise<Page>;
}

/** Where a finished export is stored; the download route reads the same key (T6.6). */
export const exportKey = exportStorageKey;

class JobFailure extends Error {}

export async function runExportJob(id: string, deps: ExportDeps): Promise<void> {
  const job = await deps.jobs.load(id);
  if (!job || job.status === 'done') return;
  const fail = (message: string) => deps.jobs.update(id, { status: 'failed', progress: 1, error: message.slice(0, 500) });
  try {
    await deps.jobs.update(id, { status: 'running', progress: 0.1, error: null });
    const res = await deps.api(`/teams/${job.teamId}/projects/${job.projectId}`);
    if (res.status !== 200) throw new JobFailure(`project unavailable (${res.status})`);
    const doc = (JSON.parse(res.body.toString('utf8')) as { doc: ProjectDoc }).doc;
    const output = doc.outputs.find((o) => o.id === job.outputIds[0]);
    if (!output) throw new JobFailure('output not found (deleted?)');
    const tooLarge = exportCapError(output, job.format, job.options);
    if (tooLarge) throw new JobFailure(tooLarge);

    const { format, options } = job;
    const page = await deps.render({
      teamId: job.teamId,
      projectId: job.projectId,
      target: output.id,
      bleed: withBleedOf(output, options),
      scale: renderScaleOf(output, format, options),
    });
    await deps.jobs.update(id, { status: 'running', progress: 0.6 });
    let file: { bytes: Uint8Array; mime: string };
    try {
      if (format === 'pdf') {
        const bleedMm = withBleedOf(output, options) ? (output.bleedMm ?? 0) : 0;
        file = await exportPdf(page, { bleedMm, cropMarks: options.cropMarks });
      } else if (format === 'svg') file = await exportSvg(page);
      else file = await exportRaster(page, format, { quality: options.quality });
    } finally {
      await page.close();
    }
    await deps.jobs.update(id, { status: 'running', progress: 0.9 });
    await deps.files.put(exportKey(job.teamId, id, format), file.bytes, file.mime);
    await deps.jobs.update(id, { status: 'done', progress: 1, error: null });
  } catch (e) {
    await fail(e instanceof JobFailure ? e.message : `render failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

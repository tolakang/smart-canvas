/** T6.5: an export job renders its output in Chromium, stores the file and records progress / errors. */
import { addOutput, connectSource, createProjectDoc, type ExportFormat, type ExportOptions, type ProjectDoc } from '@smart-canvas/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportKey, runExportJob, type ExportDeps, type JobRow } from './jobs';
import { openRender } from './render';
import { fakeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

function sampleDoc(): ProjectDoc {
  let doc = createProjectDoc('Jobs');
  doc = ok(connectSource(doc, 'background'));
  doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 200, height: 100, unit: 'px' } }));
  doc = ok(addOutput(doc, { id: 'card', label: 'Card', size: { width: 85, height: 55, unit: 'mm' }, dpi: 150, bleedMm: 3 }));
  return ok(addOutput(doc, { id: 'huge', label: 'Huge', size: { width: 7000, height: 100, unit: 'px' }, exportScale: 2 }));
}

describe('export jobs (T6.5)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  const api = fakeApi(sampleDoc());
  const rows = new Map<string, JobRow>();
  const history = new Map<string, string[]>();
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  let deps: ExportDeps;

  beforeAll(async () => {
    env = await startRenderEnv();
    deps = {
      api: api.fetch,
      jobs: {
        load: async (id) => rows.get(id) ?? null,
        update: async (id, patch) => {
          const row = rows.get(id);
          if (row) rows.set(id, { ...row, status: patch.status });
          history.set(id, [...(history.get(id) ?? []), `${patch.status}:${patch.progress}${patch.error ? `:${patch.error}` : ''}`]);
        },
      },
      files: { put: async (key, bytes, mime) => void files.set(key, { bytes, mime }) },
      render: (target) => openRender(env.browser, env.webUrl, target, api.fetch),
    };
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  const job = (id: string, output: string, format: ExportFormat, options: ExportOptions = {}): string => {
    rows.set(id, { id, projectId: PROJECT, teamId: TEAM, outputIds: [output], format, options, status: 'queued' });
    return id;
  };

  it('renders, stores the file and reports progress to done', async () => {
    const id = job('j1', 'post', 'png', { scale: 3 });
    await runExportJob(id, deps);
    expect(history.get(id)).toEqual(['running:0.1', 'running:0.6', 'running:0.9', 'done:1']);
    const file = files.get(exportKey(TEAM, id, 'png'));
    expect(file?.mime).toBe('image/png');
    const meta = await sharp(Buffer.from(file?.bytes ?? [])).metadata();
    expect([meta.width, meta.height]).toEqual([600, 300]);
  }, 60_000);

  it('PDF and SVG jobs store their files', async () => {
    await runExportJob(job('j2', 'card', 'pdf'), deps);
    expect(files.get(exportKey(TEAM, 'j2', 'pdf'))?.mime).toBe('application/pdf');
    await runExportJob(job('j3', 'post', 'svg'), deps);
    expect(Buffer.from(files.get(exportKey(TEAM, 'j3', 'svg'))?.bytes ?? []).toString('utf8')).toMatch(/^<svg /);
  }, 90_000);

  it('fails per output with a clear reason (deleted output, over the cap) and skips finished jobs', async () => {
    await runExportJob(job('j4', 'gone', 'png'), deps);
    expect(history.get('j4')?.at(-1)).toBe('failed:1:output not found (deleted?)');
    await runExportJob(job('j5', 'huge', 'png'), deps);
    expect(history.get('j5')?.at(-1)).toBe('failed:1:Huge: 14000 × 200 px is over the 12000 px limit');
    rows.set('j6', { id: 'j6', projectId: PROJECT, teamId: TEAM, outputIds: ['post'], format: 'png', options: {}, status: 'done' });
    await runExportJob('j6', deps);
    expect(history.get('j6')).toBeUndefined();
  }, 60_000);
});

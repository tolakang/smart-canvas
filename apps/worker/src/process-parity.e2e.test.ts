/**
 * T12.5 / T12.6 end to end: a process chain (Crop → Flip/Rotate → Adjust) on a photo, a Text variant of the
 * headline and a Recolor of the photo (an output-only layer) draw the same in the user's browser and in the
 * export worker: one OutputRenderer, so the PNGs match within anti-aliasing and the SVGs are the same file.
 * The board's master preview shows the processed layers, not the inputs.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, addProcess, connectOutputLayer, connectSource, disconnectSource, type ExportJob, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('process nodes: browser export matches the worker (T12.5)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Processes');
    teamId = ids.teamId;
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    // An orange photo with a green disc on its right and a blue bar at the top: crops and turns are visible.
    const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 240, g: 160, b: 30 } } })
      .composite([{ input: Buffer.from('<svg width="600" height="400"><circle cx="420" cy="220" r="120" fill="#1b5e20"/><rect x="0" y="0" width="600" height="60" fill="#0d47a1"/></svg>') }])
      .png()
      .toBuffer();
    const inNode = (l: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${l}$`) }) });
    await inNode('Subject').locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
    await inNode('Subject').locator('img.sc-thumb').waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = p.doc;
    for (const s of doc.sources) if (s.kind === 'fill') doc = ok(connectSource(doc, s.id));
    doc = ok(addProcess(doc, { id: 'crop', op: { type: 'crop', rect: { x: 0.4, y: 0, w: 0.6, h: 1 } }, board: { x: -200, y: 0 }, input: 'subject' }));
    doc = ok(addProcess(doc, { id: 'turn', op: { type: 'flip', x: true, y: false, rotate: 90 }, board: { x: -200, y: 300 }, input: 'crop' }));
    doc = ok(addProcess(doc, { id: 'tone', op: { type: 'adjust', brightness: 1.2, saturation: 0.6, opacity: 0.85, blurPx: 1 }, board: { x: -200, y: 600 }, input: 'turn' }));
    doc = ok(disconnectSource(doc, 'subject'));
    doc = ok(connectSource(doc, 'tone'));
    // T12.6: other words for the headline (white), and the photo in one colour on the output only.
    doc = ok(addProcess(doc, { id: 'words', op: { type: 'textVariant', text: 'Grand opening', style: { color: '#ffffff' } }, board: { x: -200, y: 900 }, input: 'headline' }));
    doc = ok(connectSource(doc, 'words'));
    doc = ok(addProcess(doc, { id: 'mono', op: { type: 'recolor', color: '#ffeb3b' }, board: { x: -200, y: 1200 }, input: 'subject' }));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1350, unit: 'px' } }));
    doc = ok(connectOutputLayer(doc, 'post', 'mono'));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Output Post', { exact: true }).locator('.sc-render [data-source-id="tone"] img').waitFor();
    await page.getByLabel('Output Post', { exact: true }).locator('.sc-render [data-source-id="mono"][data-mask-src]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('the board draws the processed layer: its chain folded into one crop, mirror, turn and filter', async () => {
    const layer = page.getByLabel('Master preview', { exact: true }).locator('.sc-render [data-source-id="tone"]');
    expect(await page.getByLabel('Master preview', { exact: true }).locator('.sc-render [data-source-id="subject"]').count()).toBe(0);
    const style = (await layer.getAttribute('style')) ?? '';
    expect(style).toContain('opacity: 0.85');
    expect(style).toContain('filter: brightness(1.2) saturate(0.6) blur(1px)');
    expect(await layer.locator('img').locator('..').getAttribute('style')).toContain('rotate(90deg) scaleX(-1)'); // mirror, then a quarter turn clockwise
    // T12.6: the variant's words and colour; the recolor as a mask of the photo's shape in yellow.
    const words = page.getByLabel('Master preview', { exact: true }).locator('.sc-render [data-source-id="words"]');
    expect(await words.innerText()).toContain('Grand opening');
    expect(await words.getAttribute('style')).toContain('color: rgb(255, 255, 255)');
    const mono = page.getByLabel('Output Post', { exact: true }).locator('.sc-render [data-source-id="mono"]');
    expect(await mono.getAttribute('style')).toContain('background-color: rgb(255, 235, 59)');
    // The process node shows its result too.
    await page.getByLabel('Process Adjust').locator('.sc-render [data-source-id="tone"]').waitFor();
  }, 60_000);

  async function inBrowser(format: 'png' | 'svg'): Promise<Buffer> {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Format').selectOption(format);
    await dialog.getByText('Made in your browser').waitFor();
    await dialog.getByRole('button', { name: /^Export 1 output/ }).click();
    const row = dialog.getByRole('list', { name: 'Export progress' }).locator('li');
    await expect.poll(() => row.getAttribute('data-status'), { timeout: 60_000 }).toBe('done');
    expect(await row.getAttribute('data-where')).toBe('browser');
    const [file] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Download' }).click()]);
    const bytes = readFileSync((await file.path()) as string);
    await dialog.getByRole('button', { name: 'Close' }).click();
    return bytes;
  }

  async function onServer(format: 'png' | 'svg'): Promise<Buffer> {
    const [job] = (await (await page.request.post(`${url}/exports`, { data: { outputIds: ['post'], format, options: {} } })).json()) as ExportJob[];
    if (!job) throw new Error('no job');
    await expect
      .poll(async () => ((await (await page.request.get(`${url}/exports?ids=${job.id}`)).json()) as ExportJob[])[0]?.status, { timeout: 60_000 })
      .toBe('done');
    return Buffer.from(await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/exports/${job.id}/file`)).body());
  }

  it('PNG: same pixels as the worker (within anti-aliasing)', async () => {
    const [a, b] = [await inBrowser('png'), await onServer('png')];
    const [ra, rb] = await Promise.all([a, b].map((x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect([rb?.info.width, rb?.info.height]).toEqual([1080, 1350]);
    let off = 0;
    const da = ra?.data ?? Buffer.alloc(0);
    const db = rb?.data ?? Buffer.alloc(0);
    expect(da.length).toBe(db.length);
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs((da[i] ?? 0) - (db[i] ?? 0)), Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)), Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0)), Math.abs((da[i + 3] ?? 0) - (db[i + 3] ?? 0)));
      if (d > 24) off++;
    }
    expect(off / (1080 * 1350)).toBeLessThan(0.002);
    // The recolored photo (an opaque rectangle) is drawn: a large yellow area.
    let yellow = 0;
    for (let i = 0; i < db.length; i += 4) if (Math.abs((db[i] ?? 0) - 255) < 8 && Math.abs((db[i + 1] ?? 0) - 235) < 8 && Math.abs((db[i + 2] ?? 0) - 59) < 8) yellow++;
    expect(yellow).toBeGreaterThan(100_000);
  }, 120_000);

  it('SVG: the same file as the worker', async () => {
    const [a, b] = [await inBrowser('svg'), await onServer('svg')];
    expect(a.toString('utf8')).toBe(b.toString('utf8'));
  }, 120_000);
});

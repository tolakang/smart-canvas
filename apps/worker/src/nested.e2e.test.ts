/**
 * T12.8 end to end: a master preview used as a layer of another. On the board its "Use as a layer" port wires
 * onto a row of the master preview, which then draws it (its own scene, fitted into its frame). Exported, the
 * nested scene (a photo and Khmer + Latin text) draws the same in the browser and in the worker.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addComposition, addOutput, connectSource, type ExportJob, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { readFileSync } from 'node:fs';
import type { Locator, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('nested compositions (T12.8)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Nested');
    teamId = ids.teamId;
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 120, b: 200 } } })
      .composite([{ input: Buffer.from('<svg width="600" height="400"><circle cx="300" cy="200" r="140" fill="#ffca28"/></svg>') }])
      .png()
      .toBuffer();
    const inNode = (l: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${l}$`) }) });
    await inNode('Subject').locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
    await inNode('Subject').locator('img.sc-thumb').waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

    // A 1000×500 "badge" preview with the photo and the headline (Khmer + Latin); main has the background.
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc: ProjectDoc = { ...p.doc, sources: p.doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'សួស្តី Hello' } } : s.content.kind === 'fill' ? { ...s, content: { kind: 'fill', fill: { type: 'solid', color: '#263238' } } } : s)) };
    doc = ok(connectSource(doc, 'background'));
    doc = ok(addComposition(doc, { id: 'badge', label: 'Badge', size: { width: 1000, height: 500, unit: 'px' }, board: { x: 0, y: 1000 } }));
    doc = ok(connectSource(doc, 'subject', undefined, 'badge'));
    doc = ok(connectSource(doc, 'headline', undefined, 'badge'));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1350, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-mainNode[data-id="comp:badge"]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  it('wire the badge’s "Use as a layer" port onto the front row of the master preview: main draws it', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    const a = await centre(page.locator('.react-flow__node-mainNode[data-id="comp:badge"] .react-flow__handle[data-handleid="layer"]'));
    // Onto row 0, so it is in front of the background.
    const b = await centre(page.locator('.react-flow__node-mainNode[data-id="main"] .sc-port[data-port="0"] .react-flow__handle'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
    await expect.poll(async () => (await doc()).edges.some((e) => e.from === 'badge' && e.to === 'main' && e.kind === 'layer')).toBe(true);
    // An element: in front of the other elements, under the logo and the headline (D45).
    await expect.poll(async () => (await doc()).compositions[0]?.layers.indexOf('badge')).toBe(2);
    const nested = page.getByLabel('Master preview', { exact: true }).locator('.sc-render [data-source-id="badge"][data-kind="nested"]');
    await nested.locator('[data-source-id="subject"]').waitFor();
    expect(await nested.locator('[data-source-id="headline"]').innerText()).toContain('Hello');
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
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

  it('PNG: same pixels as the worker; the nested photo is drawn', async () => {
    const [a, b] = [await inBrowser('png'), await onServer('png')];
    const [ra, rb] = await Promise.all([a, b].map((x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect([rb?.info.width, rb?.info.height]).toEqual([1080, 1350]);
    const da = ra?.data ?? Buffer.alloc(0);
    const db = rb?.data ?? Buffer.alloc(0);
    expect(da.length).toBe(db.length);
    let off = 0;
    let amber = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs((da[i] ?? 0) - (db[i] ?? 0)), Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)), Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0)), Math.abs((da[i + 3] ?? 0) - (db[i + 3] ?? 0)));
      if (d > 24) off++;
      if (Math.abs((db[i] ?? 0) - 255) < 10 && Math.abs((db[i + 1] ?? 0) - 202) < 10 && Math.abs((db[i + 2] ?? 0) - 40) < 10) amber++;
    }
    expect(off / (1080 * 1350)).toBeLessThan(0.002);
    expect(amber).toBeGreaterThan(5_000); // the photo's disc, inside the nested preview
  }, 120_000);

  it('SVG: the same file as the worker', async () => {
    const [a, b] = [await inBrowser('svg'), await onServer('svg')];
    expect(a.toString('utf8')).toBe(b.toString('utf8'));
  }, 120_000);
});

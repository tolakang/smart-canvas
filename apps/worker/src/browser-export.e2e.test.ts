/**
 * T11.1 (D31) end to end: files made in the user's browser match the export worker's for the same output.
 * One output with a gradient, a photo and a Khmer + Latin headline is exported as PNG and SVG from the export
 * dialog (made in the browser) and as server jobs through the API; the PNGs must match pixel for pixel
 * (within anti-aliasing) and the SVGs must be the same file.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, connectSource, type ExportJob, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('browser export matches the worker (T11.1)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Parity');
    teamId = ids.teamId;
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 240, g: 160, b: 30 } } })
      .composite([{ input: Buffer.from('<svg width="600" height="400"><circle cx="300" cy="200" r="150" fill="#1b5e20"/></svg>') }])
      .png()
      .toBuffer();
    await putPicture(page, 'Subject', { name: 'photo.png', mimeType: 'image/png', buffer: photo });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc: ProjectDoc = {
      ...p.doc,
      sources: p.doc.sources.map((s) =>
        s.content.kind === 'text'
          ? { ...s, content: { ...s.content, text: 'សូមស្វាគមន៍ Grand opening ៥០%' } }
          : s.content.kind === 'fill'
            ? { ...s, content: { kind: 'fill', fill: { type: 'linear', angleDeg: 135, stops: [{ offset: 0, color: '#0d47a1' }, { offset: 1, color: '#7b1fa2' }] } } }
            : s,
      ),
    };
    for (const s of doc.sources) if (s.kind !== 'vector') doc = ok(connectSource(doc, s.id));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1350, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Preview Post', { exact: true }).locator('.sc-render [data-source-id="subject"]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  async function inBrowser(format: 'png' | 'svg' | 'jpg'): Promise<Buffer> {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Format').selectOption(format);
    await dialog.getByText('Made in your browser').waitFor();
    await dialog.getByRole('button', { name: /^Export 1 Preview/ }).click();
    const row = dialog.getByRole('list', { name: 'Export progress' }).locator('li');
    await expect.poll(() => row.getAttribute('data-status'), { timeout: 60_000 }).toBe('done');
    expect(await row.getAttribute('data-where')).toBe('browser');
    const [file] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Download' }).click()]);
    expect(file.suggestedFilename()).toBe(`Parity_Post_${format === 'svg' ? '1080x1350px' : '1080x1350'}.${format}`);
    const bytes = readFileSync((await file.path()) as string);
    await dialog.getByRole('button', { name: 'Close' }).click();
    return bytes;
  }

  async function onServer(format: 'png' | 'svg' | 'jpg'): Promise<Buffer> {
    const [job] = (await (await page.request.post(`${url}/exports`, { data: { outputIds: ['post'], format, options: {} } })).json()) as ExportJob[];
    if (!job) throw new Error('no job');
    await expect
      .poll(async () => ((await (await page.request.get(`${url}/exports?ids=${job.id}`)).json()) as ExportJob[])[0]?.status, { timeout: 60_000 })
      .toBe('done');
    return Buffer.from(await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/exports/${job.id}/file`)).body());
  }

  it('PNG: same size and pixels as the worker (within anti-aliasing)', async () => {
    const [a, b] = [await inBrowser('png'), await onServer('png')];
    const [ra, rb] = await Promise.all([a, b].map((x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect([ra?.info.width, ra?.info.height]).toEqual([1080, 1350]);
    expect([rb?.info.width, rb?.info.height]).toEqual([1080, 1350]);
    let off = 0;
    const da = ra?.data ?? Buffer.alloc(0);
    const db = rb?.data ?? Buffer.alloc(0);
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs((da[i] ?? 0) - (db[i] ?? 0)), Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)), Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0)), Math.abs((da[i + 3] ?? 0) - (db[i + 3] ?? 0)));
      if (d > 24) off++;
    }
    // Before the font wait in svgToRaster, Khmer came out unshaped here: 1.7% of pixels off.
    expect(off / (1080 * 1350)).toBeLessThan(0.002);
  }, 120_000);

  it('SVG: the same file as the worker', async () => {
    const [a, b] = [await inBrowser('svg'), await onServer('svg')];
    expect(a.toString('utf8')).toBe(b.toString('utf8'));
  }, 120_000);

  it('JPG: full-resolution colour (4:4:4) in the browser and on the worker, close to the lossless PNG', async () => {
    const png = await inBrowser('png');
    const ref = await sharp(png).flatten({ background: '#ffffff' }).raw().toBuffer();
    const psnr = async (jpg: Buffer) => {
      const d = await sharp(jpg).removeAlpha().raw().toBuffer();
      let se = 0;
      for (let i = 0; i < ref.length; i++) se += ((ref[i] ?? 0) - (d[i] ?? 0)) ** 2;
      return 10 * Math.log10((255 * 255) / (se / ref.length));
    };
    for (const jpg of [await inBrowser('jpg'), await onServer('jpg')]) {
      const meta = await sharp(jpg).metadata();
      expect(meta.format).toBe('jpeg');
      expect([meta.width, meta.height]).toEqual([1080, 1350]);
      // The browser's own encoder (canvas.toBlob) is 4:2:0: half the colour resolution, smeared red text.
      expect(meta.chromaSubsampling).toBe('4:4:4');
      expect(await psnr(jpg)).toBeGreaterThan(38);
    }
  }, 180_000);
});

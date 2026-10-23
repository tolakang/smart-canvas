/**
 * T8.3 / D49 end to end: drop image files from the desktop onto the asset nodes. The Image and Logo nodes add
 * each file as its own layer (PNG, JPEG, WebP or SVG; a PDF as its first page, in vector — M3 — or as pixels where a slot takes only pixels, N2); a fill background takes a photo in a slot and becomes an
 * image background (D9).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

/** N2: a one-page PDF (200 × 100 pt) with a filled rectangle, with a correct cross-reference table. */
function onePagePdf(): string {
  const content = '0 0.6 0.4 rg 20 20 160 60 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${out}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>';

describe.skipIf(!adminUrl)('drop an image onto an input (T8.3)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let png = '';

  beforeAll(async () => {
    stack = await startStack();
    png = (await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()).toString('base64');
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Drop');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;

  /** A desktop file drag: dragenter/dragover then drop, with the file in the DataTransfer. */
  async function dropFile(target: Locator, file: { name: string; type: string; base64?: string; text?: string }) {
    const dt = await page.evaluateHandle((f) => {
      const data = new DataTransfer();
      const bytes = f.base64 ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.text ?? '');
      data.items.add(new File([bytes], f.name, { type: f.type }));
      return data;
    }, file);
    await target.dispatchEvent('dragenter', { dataTransfer: dt });
    await target.dispatchEvent('dragover', { dataTransfer: dt });
    await target.dispatchEvent('drop', { dataTransfer: dt });
  }

  it('a PNG dropped on the Image node adds a picture, its own layer, wired (D49)', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await dropFile(boardNode(page, 'Image').locator('.sc-node__head'), { name: 'subject.png', type: 'image/png', base64: png });
    await expect.poll(() => boardNode(page, 'Image').locator('.sc-assets__pick img').count(), { timeout: 15_000 }).toBe(1);
    await saved();
    const d = await doc();
    const added = d.sources.find((s) => s.label === 'subject');
    expect(added).toMatchObject({ kind: 'image', behavesLike: 'subject' });
    expect(d.edges.some((e) => e.kind === 'layer' && e.from === added?.id && e.to === 'main')).toBe(true);
  }, 60_000);

  it('a PNG or an SVG dropped on the Logo node adds a logo (D49: PNG, JPG, WebP and SVG)', async () => {
    await dropFile(boardNode(page, 'Logo').locator('.sc-node__head'), { name: 'mark.png', type: 'image/png', base64: png });
    await dropFile(boardNode(page, 'Logo').locator('.sc-node__head'), { name: 'mark.svg', type: 'image/svg+xml', text: SVG });
    await expect.poll(() => boardNode(page, 'Logo').locator('.sc-assets__pick img').count(), { timeout: 15_000 }).toBe(2);
    await saved();
    const logos = (await doc()).sources.filter((s) => s.label === 'mark');
    expect(logos.map((s) => [s.kind, s.behavesLike]).sort()).toEqual([['image', 'logo'], ['vector', 'logo']]);
  }, 60_000);

  it('M3: a PDF dropped on the Image node adds its first page in vector (an SVG); an unreadable PDF says so', async () => {
    await dropFile(boardNode(page, 'Image').locator('.sc-node__head'), { name: 'flyer.pdf', type: 'application/pdf', text: onePagePdf() });
    await expect.poll(() => boardNode(page, 'Image').locator('.sc-assets__pick img').count(), { timeout: 20_000 }).toBe(2);
    await saved();
    const added = (await doc()).sources.find((s) => s.label === 'flyer');
    expect(added).toMatchObject({ kind: 'vector', behavesLike: 'subject' });
    const assetId = added?.content.kind === 'vector' ? added.content.assetId : '';
    const res = await page.request.get(url.replace(/projects\/.*$/, `assets/${assetId}/content`));
    expect(res.headers()['content-type']).toBe('image/svg+xml');
    const svg = await res.text();
    expect(svg).toContain('width="200" height="100"');
    expect(svg).toMatch(/<path [^>]*fill="rgb\(0%, 59\.9\d*%, 39\.9\d*%\)"/); // the page's rectangle, as a path
    // It renders: the rectangle is drawn, outside it the page is transparent.
    const { data, info } = await sharp(Buffer.from(svg)).resize(200, 100).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(at(100, 50)).toBe(255);
    expect(at(5, 5)).toBe(0);

    await dropFile(boardNode(page, 'Image').locator('.sc-node__head'), { name: 'broken.pdf', type: 'application/pdf', text: '%PDF-1.4 not really' });
    await expect.poll(() => boardNode(page, 'Image').getByRole('alert').innerText(), { timeout: 20_000 }).toContain('broken.pdf: use a PNG, JPEG, WebP, SVG or PDF file.');
  }, 60_000);

  it('a photo dropped on the Background node’s Vertical slot makes it an image background (D9, D43); undo restores the fill', async () => {
    expect((await doc()).sources.find((s) => s.id === 'background')?.kind).toBe('fill');
    const bgNode = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Background$/ }) });
    await dropFile(bgNode.locator('.sc-bg-slot--vertical'), { name: 'bg.png', type: 'image/png', base64: png });
    await bgNode.getByRole('img', { name: 'Vertical background' }).waitFor();
    await saved();
    const bg = (await doc()).sources.find((s) => s.id === 'background');
    expect(bg).toMatchObject({ kind: 'image', behavesLike: 'background' });
    expect(bg?.content.kind === 'image' && bg.content.variants?.vertical).toBeTruthy();

    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Control+z');
    await saved();
    await expect.poll(async () => (await doc()).sources.find((s) => s.id === 'background')?.kind).toBe('fill');
  }, 60_000);

  it('the Text node ignores dropped files, and a file dropped on the canvas does not leave the board', async () => {
    await dropFile(boardNode(page, 'Text').locator('.sc-node__head'), { name: 'x.png', type: 'image/png', base64: png });
    await dropFile(page.locator('.react-flow__pane'), { name: 'x.png', type: 'image/png', base64: png });
    await page.waitForTimeout(300);
    expect(page.url()).toContain('#/t/');
    expect(await boardNode(page, 'Text').getByRole('alert').count()).toBe(0);
  }, 30_000);

  it('N2: a slot that takes only pixels (a Background slot) gets the PDF’s first page as a PNG', async () => {
    const bgNode = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Background$/ }) });
    await dropFile(bgNode.locator('.sc-bg-slot--vertical'), { name: 'bg.pdf', type: 'application/pdf', text: onePagePdf() });
    await bgNode.getByRole('img', { name: 'Vertical background' }).waitFor({ timeout: 20_000 });
    await saved();
    const bg = (await doc()).sources.find((s) => s.id === 'background');
    const assetId = bg?.content.kind === 'image' ? bg.content.variants?.vertical : '';
    const res = await page.request.get(url.replace(/projects\/.*$/, `assets/${assetId}/content`));
    expect(res.headers()['content-type']).toBe('image/png');
    const meta = await sharp(await res.body()).metadata();
    expect([meta.width, meta.height]).toEqual([4000, 2000]);
  }, 60_000);
});

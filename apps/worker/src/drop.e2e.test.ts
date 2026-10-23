/**
 * T8.3 / D49 end to end: drop image files from the desktop onto the asset nodes. The Image and Logo nodes add
 * each file as its own layer (PNG, JPEG, WebP or SVG); a fill background takes a photo in a slot and becomes an
 * image background (D9).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

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
});

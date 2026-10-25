/**
 * D43 end to end: a background's vertical / horizontal pictures. Adding a vertical picture in the Background's
 * inspector makes the story draw it, while the square post keeps the main background; exporting the story draws it.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('background pictures for vertical / horizontal outputs (D43)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Backgrounds');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(addOutput(cur.doc, { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1080, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: cur.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Preview Story', { exact: true }).waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const bgOf = (output: string) => page.getByLabel(`Preview ${output}`, { exact: true }).locator('.sc-render [data-source-id="background"]').first();

  it('a vertical picture added in the inspector is drawn by the story only', async () => {
    const tall = await sharp({ create: { width: 400, height: 800, channels: 3, background: { r: 20, g: 160, b: 90 } } }).png().toBuffer();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Background$/ }) }).locator('.sc-node__title').click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await inspector.getByLabel('Vertical background picture').setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: tall });
    await inspector.getByRole('img', { name: 'Vertical background' }).waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    const d = (await (await page.request.get(url)).json()).doc as ProjectDoc;
    const bg = d.sources.find((s) => s.id === 'background');
    expect(bg?.content.kind).toBe('image'); // the fill background took the photo (D9)
    const vertical = bg?.content.kind === 'image' ? bg.content.variants?.vertical : undefined;
    expect(vertical).toBeTruthy();
    await expect.poll(() => bgOf('Story').getAttribute('src')).toContain(vertical ?? '-');
    // A new main picture: the square post changes, the story keeps its vertical one.
    const red = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    await inspector.locator('.sc-inspector-panel__form input[type=file]').first().setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: red });
    const mainOf = async () => {
      const m = ((await (await page.request.get(url)).json()).doc as ProjectDoc).sources.find((s) => s.id === 'background');
      return m?.content.kind === 'image' ? m.content.assetId : null;
    };
    await expect.poll(mainOf, { timeout: 15_000 }).not.toBe(vertical);
    const mainId = await mainOf();
    expect(mainId).toBeTruthy();
    await expect.poll(() => bgOf('Post').getAttribute('src')).toContain(mainId ?? '-');
    expect(await bgOf('Story').getAttribute('src')).toContain(vertical ?? '-');
  }, 60_000);

  it('the story exports with its vertical picture (green), not a white fill', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Format').selectOption('png');
    for (const label of await dialog.getByRole('checkbox').all()) if ((await label.getAttribute('aria-label'))?.includes('Post')) await label.uncheck();
    await dialog.getByRole('button', { name: /^Export \d Preview/ }).click();
    const rows = dialog.getByRole('list', { name: 'Export progress' }).locator('li');
    await expect.poll(async () => (await rows.evaluateAll((li) => li.map((l) => l.getAttribute('data-status')))).every((s) => s === 'done'), { timeout: 60_000 }).toBe(true);
    const story = rows.filter({ hasText: 'Story' }).first();
    const [file] = await Promise.all([page.waitForEvent('download'), story.getByRole('link', { name: 'Download' }).click()]);
    const { data } = await sharp(readFileSync((await file.path()) as string)).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]].map((v) => Math.round((v ?? 0) / 10))).toEqual([2, 16, 9]);
    await dialog.getByRole('button', { name: 'Close' }).click();
  }, 120_000);
  it('D43.1: the node shows Square · Vertical · Horizontal; a square Preview moved to Vertical draws the vertical picture', async () => {
    const node = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Background$/ }) });
    for (const slot of ['square', 'vertical', 'horizontal']) await node.locator(`.sc-bg-slot--${slot}`).waitFor();
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const bg = cur.doc.sources.find((s) => s.id === 'background');
    const vertical = bg?.content.kind === 'image' ? bg.content.variants?.vertical : undefined;
    const doc = { ...cur.doc, outputs: cur.doc.outputs.map((o) => (o.id === 'post' ? { ...o, layout: 'vertical' as const } : o)) };
    expect((await page.request.put(url, { data: { rev: cur.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Preview Post', { exact: true }).waitFor();
    await expect.poll(() => bgOf('Post').getAttribute('src')).toContain(vertical ?? '-');
    // Like the Headline node: a tapped slot is selected and keeps its Replace / Remove actions shown (touch has no hover).
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await node.getByRole('button', { name: 'Vertical background', exact: true }).click();
    await expect.poll(() => node.locator('.sc-bg-slot--vertical').getAttribute('class')).toContain('sc-slot--focus');
    await node.getByRole('button', { name: 'Clear vertical background' }).waitFor({ state: 'visible' });
    expect(await node.locator('.sc-bg-slot--horizontal').getAttribute('class')).not.toContain('sc-slot--focus');
    // Owner sketch: Horizontal across the top, Square and Vertical side by side below; the actions fit inside their tile.
    const box = async (slot: string) => (await node.locator(`.sc-bg-slot--${slot} .sc-slot__tile`).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const [h, sq, v] = [await box('horizontal'), await box('square'), await box('vertical')];
    expect(sq.y).toBeGreaterThan(h.y + h.height - 1);
    expect(v.x).toBeGreaterThan(sq.x + sq.width - 1);
    expect(sq.width / sq.height).toBeCloseTo(1, 1);
    expect(v.height).toBeGreaterThan(v.width);
    const acts = (await node.locator('.sc-bg-slot--vertical .sc-slot__actions').boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    expect(acts.x).toBeGreaterThanOrEqual(v.x);
    expect(acts.x + acts.width).toBeLessThanOrEqual(v.x + v.width);
    if (process.env.SC_SHOTS) await node.screenshot({ path: `${process.env.SC_SHOTS}/background-node.png` });
  }, 60_000);
});

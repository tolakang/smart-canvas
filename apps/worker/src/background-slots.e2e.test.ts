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
});

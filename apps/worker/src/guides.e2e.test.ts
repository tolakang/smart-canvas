/**
 * D42 end to end: layout guides. The master preview's inspector adds a vertical and a horizontal guide (seeded
 * from the master, so nothing moves); each output says which guide it follows; arranging the vertical guide
 * changes the story, not the square post.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, computeLayout, guidesOf, MAIN, withComposition, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const measure = (text: string, px: number) => text.length * 0.5 * px;

describe.skipIf(!adminUrl)('layout guides (D42)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Guides');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 30, g: 120, b: 220, alpha: 1 } } }).png().toBuffer();
    await putPicture(page, 'Subject', { name: 's.png', mimeType: 'image/png', buffer: png });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(addOutput(cur.doc, { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 2400, height: 2400, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: cur.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Preview Story', { exact: true }).waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<{ rev: number; doc: ProjectDoc }> => (await page.request.get(url)).json();
  const subjectIn = (d: ProjectDoc, output: string) => computeLayout(d, output, { measure, assets: {} }).items.find((i) => i.sourceId === 'subject')?.frame;

  it('the Layer Comp’s Vertical and Horizontal buttons add those layouts (D49); outputs say which they follow; nothing moves', async () => {
    const before = (await doc()).doc;
    for (const family of ['Vertical', 'Horizontal'] as const) {
      await openLayout(page, family);
      const editor = page.getByRole('dialog', { name: /Layer Comp editor/ });
      await editor.waitFor();
      await page.keyboard.press('Escape');
      await editor.waitFor({ state: 'detached' });
    }
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    const d = (await doc()).doc;
    expect(guidesOf(d, MAIN).map((g) => g.label)).toEqual(['Vertical guide', 'Horizontal guide']);
    // Still one Layer Comp on the board: the layouts open from it.
    expect(await page.locator('.react-flow__node-mainNode').count()).toBe(1);
    await page.getByLabel('Preview Story', { exact: true }).getByText('Vertical guide').waitFor();
    expect(await page.getByLabel('Preview Post', { exact: true }).getByText('guide').count()).toBe(0);
    // Seeded from the master through the grid: the story looks the same as before.
    const [a, b] = [subjectIn(before, 'story'), subjectIn(d, 'story')];
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(b?.[k]).toBeCloseTo(a?.[k] ?? NaN, 3);
  }, 60_000);

  it('arranging the vertical guide moves the subject in the story only', async () => {
    const cur = await doc();
    const vertical = guidesOf(cur.doc, MAIN).find((g) => g.guide?.family === 'vertical');
    if (!vertical) throw new Error('no vertical guide');
    const postBefore = subjectIn(cur.doc, 'post');
    const next = withComposition(cur.doc, vertical.id, (c) => ({ ...c, placements: { ...c.placements, subject: { x: 0.1, y: 0.05, w: 0.8, h: 0.3 } } }));
    expect((await page.request.put(url, { data: { rev: cur.rev, doc: next } })).status()).toBe(200);
    await page.reload();
    const story = page.getByLabel('Preview Story', { exact: true }).locator('.sc-render').first();
    await story.locator('[data-source-id="subject"]').waitFor();
    // Near the top of the story now.
    const top = await story.evaluate((r) => {
      const box = r.getBoundingClientRect();
      const s = r.querySelector('[data-source-id="subject"]')?.getBoundingClientRect();
      return s ? (s.y - box.y) / box.height : 1;
    });
    expect(top).toBeLessThan(0.1);
    const after = (await doc()).doc;
    expect(subjectIn(after, 'post')).toEqual(postBefore);
  }, 60_000);
});

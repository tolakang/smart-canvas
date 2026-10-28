/**
 * M1 end to end: while one layout is edited, the dragged layer snaps to its spot in the other layouts (mapped by
 * relative position), and a dashed outline shows that spot during the drag.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { guidesOf, MAIN, mainComposition, type NFrame, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('snap to the layer’s spot in the other layouts (M1)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Spots');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 30, g: 90, b: 220, alpha: 1 } } }).png().toBuffer();
    await putPicture(page, 'Subject', { name: 's.png', mimeType: 'image/png', buffer: png });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await saved();
    // The Vertical layout, then the subject moved there to the right of its Square spot.
    await openLayout(page, 'Vertical');
    await editor().waitFor();
    await saved();
    await page.keyboard.press('Escape');
    await editor().waitFor({ state: 'detached' });
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const sq = mainComposition(p.doc).placements.subject as NFrame;
    square = sq;
    const doc: ProjectDoc = {
      ...p.doc,
      compositions: p.doc.compositions.map((c) => (c.guide?.of === MAIN && c.guide.family === 'vertical' ? { ...c, placements: { ...c.placements, subject: { ...sq, x: sq.x + 0.12, w: sq.w * 0.6, h: sq.h * 0.6 } } } : c)),
    };
    expect(guidesOf(p.doc, MAIN).some((g) => g.guide?.family === 'vertical')).toBe(true);
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-mainNode').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  let square: NFrame = { x: 0, y: 0, w: 0, h: 0 };
  const editor = () => page.getByRole('dialog', { name: /Main Comps editor/ });
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;

  it('dragging the subject near its Square spot in the Vertical layout lands its left edge on that spot, with an outline', async () => {
    await openLayout(page, 'Vertical');
    await editor().getByRole('complementary', { name: 'Layers' }).locator('[data-layer="subject"]').click();
    const canvas = await editor().locator('.sc-editor__canvas').boundingBox();
    const sel = await editor().getByTestId('selection-box').boundingBox();
    if (!canvas || !sel) throw new Error('no canvas');
    const spotLeft = canvas.x + square.x * canvas.width;
    const c = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 };
    const dx = spotLeft + 3 - sel.x; // 3 screen px short of the spot
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 2, c.y, { steps: 5 });
    await page.mouse.move(c.x + dx, c.y, { steps: 5 });
    const spot = editor().getByTestId('layout-spot');
    expect(await spot.count()).toBe(1);
    expect(await spot.innerText()).toBe('Square');
    expect(await editor().locator('.tb-guides line').count()).toBeGreaterThan(0);
    await page.mouse.up();
    await saved();
    expect(await spot.count()).toBe(0); // only while dragging
    const vertical = guidesOf(await doc(), MAIN).find((g) => g.guide?.family === 'vertical');
    expect((vertical?.placements.subject as NFrame).x).toBeCloseTo(square.x, 4);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/layout-spot.png` });
  }, 60_000);
});

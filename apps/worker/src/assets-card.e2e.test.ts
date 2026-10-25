/**
 * D40 end to end: an Assets card holds many pictures. Pick or drop several files at once; each becomes its own
 * layer, wired into the master preview. Click a picture to set it in the inspector, × deletes one; pictures
 * dropped on the empty canvas make a new card there.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { mainComposition, wiredLayers, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const colours = [
  { r: 220, g: 30, b: 30 },
  { r: 30, g: 160, b: 60 },
  { r: 30, g: 60, b: 220 },
];

describe.skipIf(!adminUrl)('Assets card: many pictures in one input (D40)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let pngs: Buffer[] = [];

  beforeAll(async () => {
    stack = await startStack();
    pngs = await Promise.all(colours.map((background) => sharp({ create: { width: 60, height: 40, channels: 4, background: { ...background, alpha: 1 } } }).png().toBuffer()));
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Assets');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = async () => {
    await page.waitForTimeout(150);
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  };
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  // D49: the default board already has a Logo node and an Image node; the tests use the Image nodes they add.
  const cards = () => page.locator('.react-flow__node-assetsNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Image$/ }) });
  const added = () => cards().nth(1);
  /** An empty spot of the canvas, in screen coordinates. */
  const emptySpot = () =>
    page.evaluate(() => {
      const p = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!p) return null;
      for (let y = p.bottom - 200; y > p.top; y -= 40)
        for (let x = p.left + 340; x < p.right - 300; x += 40) if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      return null;
    });

  it('add an Image node from + Add and pick three files at once: three layers, all wired', async () => {
    // + Add puts it at the end of the asset nodes' row (D49).
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Image node' }).click();
    await added().waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await added()
      .getByLabel('Add pictures to Image')
      .setInputFiles(pngs.map((buffer, i) => ({ name: `pic-${i + 1}.png`, mimeType: 'image/png', buffer })));
    await expect.poll(() => added().locator('.sc-slot__pick img').count(), { timeout: 20_000 }).toBe(3);
    await saved();
    const d = await doc();
    const items = d.stacks?.at(-1)?.items ?? [];
    expect(items).toHaveLength(3);
    expect(items.map((id) => d.sources.find((s) => s.id === id)?.label)).toEqual(['pic-1', 'pic-2', 'pic-3']);
    for (const id of items) expect(wiredLayers(d, 'main').has(id)).toBe(true);
    // In the elements group, the first file in front (D45).
    const layers = mainComposition(d).layers;
    expect(layers.slice(layers.indexOf(items[0] ?? ''), layers.indexOf(items[0] ?? '') + 3)).toEqual(items);
    expect(layers.indexOf(items[0] ?? '')).toBeGreaterThan(layers.indexOf('headline'));
    // One node for the three pictures, not three nodes.
    expect(await page.locator('.react-flow__node-inputNode').filter({ hasText: 'pic-2' }).count()).toBe(0);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/assets-card.png` });
  }, 90_000);

  it('a picture clicked on the card is set in the inspector; × deletes it', async () => {
    await added().getByRole('button', { name: 'Select pic-2' }).click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect.poll(() => inspector.getByLabel('Input name').inputValue()).toBe('pic-2');
    expect(await inspector.getByLabel('pic-2 behaves like').inputValue()).toBe('subject');
    page.once('dialog', (dialog) => void dialog.accept());
    await added().getByRole('button', { name: 'Delete pic-2' }).click({ force: true });
    await expect.poll(() => added().locator('.sc-slot__pick img').count()).toBe(2);
    await saved();
    const d = await doc();
    expect(d.sources.some((s) => s.label === 'pic-2')).toBe(false);
    expect(d.stacks?.at(-1)?.items).toHaveLength(2);
  }, 60_000);

  it('page 3: the card switches between a grid and a list (with names)', async () => {
    const card = added();
    // V1: grid / list is in the card's ⋯ menu.
    await card.getByRole('button', { name: / actions$/ }).click();
    await page.getByRole('menuitem', { name: 'List view' }).click();
    await expect.poll(() => card.locator('.sc-assets--list .sc-slot__label').allInnerTexts()).toEqual(['pic-1', 'pic-3']);
    await card.getByRole('button', { name: / actions$/ }).click();
    await page.getByRole('menuitem', { name: 'Grid view' }).click();
    await expect.poll(() => card.locator('.sc-slot__label').count()).toBe(0);
  }, 30_000);

  it('pictures dropped on the empty canvas make a new card there', async () => {
    const spot = await emptySpot();
    if (!spot) throw new Error('no empty spot');
    const dt = await page.evaluateHandle((files) => {
      const data = new DataTransfer();
      for (const f of files) data.items.add(new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, { type: 'image/png' }));
      return data;
    }, pngs.slice(0, 2).map((b, i) => ({ name: `drop-${i + 1}.png`, base64: b.toString('base64') })));
    const pane = page.locator('.react-flow__pane');
    for (const type of ['dragenter', 'dragover', 'drop']) await pane.dispatchEvent(type, { dataTransfer: dt, clientX: spot.x, clientY: spot.y });
    await expect.poll(() => cards().count(), { timeout: 20_000 }).toBe(3);
    await saved();
    const d = await doc();
    const card = d.stacks?.find((st) => st.items.some((id) => d.sources.find((s) => s.id === id)?.label === 'drop-1'));
    expect(card?.items.map((id) => d.sources.find((s) => s.id === id)?.label)).toEqual(['drop-1', 'drop-2']);
    for (const id of card?.items ?? []) expect(wiredLayers(d, 'main').has(id)).toBe(true);
  }, 60_000);
});

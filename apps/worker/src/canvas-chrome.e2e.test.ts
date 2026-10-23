/**
 * T13.5 end to end: canvas chrome. The floating toolbar switches Select / Hand (and V / H), zooms and fits,
 * toggles grid snap and the minimap (remembered); the wheel pans and Ctrl + wheel zooms; a dragged node snaps
 * to another node's edge.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('canvas chrome (T13.5)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1700, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Chrome');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const bar = () => page.getByRole('toolbar', { name: 'Canvas tools' });
  const zoom = async () => Number((await bar().getByLabel('Board zoom').textContent())?.replace('%', ''));
  const transform = () => page.locator('.react-flow__viewport').evaluate((el) => getComputedStyle(el).transform);

  it('tools: buttons and V / H keys', async () => {
    const select = bar().getByRole('button', { name: 'Select (V)' });
    const hand = bar().getByRole('button', { name: /^Hand/ });
    expect(await select.getAttribute('aria-pressed')).toBe('true');
    await hand.click();
    expect(await hand.getAttribute('aria-pressed')).toBe('true');
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('v');
    expect(await select.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('h');
    expect(await hand.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('v');
  }, 60_000);

  it('zoom in / out, fit; wheel pans, Ctrl + wheel zooms', async () => {
    const z0 = await zoom();
    await bar().getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(zoom).toBeGreaterThan(z0);
    await bar().getByRole('button', { name: 'Zoom out' }).click();
    await bar().getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(zoom).toBeLessThan(z0);
    await bar().getByRole('button', { name: /^Fit to screen/ }).click();
    await expect.poll(zoom).toBe(z0);

    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    const t0 = await transform();
    await page.mouse.wheel(0, 200);
    await expect.poll(transform).not.toBe(t0);
    expect(await zoom()).toBe(z0); // panned, not zoomed
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(zoom).toBeGreaterThan(z0);
    await bar().getByRole('button', { name: /^Fit to screen/ }).click();
  }, 60_000);

  it('grid snap and minimap toggles, remembered across a reload', async () => {
    const grid = bar().getByRole('button', { name: 'Snap to grid' });
    const map = bar().getByRole('button', { name: 'Minimap' });
    expect(await grid.getAttribute('aria-pressed')).toBe('false');
    expect(await page.locator('.react-flow__minimap').count()).toBe(1);
    await grid.click();
    await map.click();
    expect(await page.locator('.react-flow__minimap').count()).toBe(0);
    await page.reload();
    await bar().waitFor();
    expect(await bar().getByRole('button', { name: 'Snap to grid' }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.react-flow__minimap').count()).toBe(0);
    await bar().getByRole('button', { name: 'Snap to grid' }).click();
    await bar().getByRole('button', { name: 'Minimap' }).click();
  }, 60_000);

  it('a dragged node snaps to the left edge of another', async () => {
    const d = await doc();
    const source = d.sources[0];
    if (!source) throw new Error('no input');
    const main = await page.locator('.react-flow__node-mainNode[data-id="main"]').boundingBox();
    const node = page.locator(`.react-flow__node-inputNode[data-id="src:${source.id}"]`);
    const box = await node.boundingBox();
    if (!main || !box) throw new Error('no nodes');
    // Grab the input by its header and drop it below the master preview, 3 px right of its left edge.
    const grab = { x: box.x + 20, y: box.y + 10 };
    const to = { x: main.x + 3 + 20, y: main.y + main.height + 80 + 10 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1, grab.y + 1); // starts the drag (React Flow measures from here)
    await page.mouse.move((grab.x + to.x) / 2, (grab.y + to.y) / 2, { steps: 8 });
    await page.mouse.move(to.x + 1, to.y + 1, { steps: 8 });
    await expect.poll(() => page.locator('.sc-guide--v').count()).toBe(1); // drag moves land a frame later
    await page.mouse.up();
    expect(await page.locator('.sc-guide').count()).toBe(0);
    // Autosave waits 800 ms after the drop: give the save time to land (the default 1 s poll races it on slow runners).
    const masterX = (await doc()).compositions[0]?.board.x;
    await expect.poll(async () => (await doc()).sources.find((s) => s.id === source.id)?.board.x, { timeout: 15_000 }).toBe(masterX);
  }, 60_000);
});

/**
 * T8.6 end to end: the main preview editor moves and resizes assets directly on the canvas.
 * Press-and-drag moves an unselected asset in one gesture; the selection box doesn't hide the layers under
 * it (a click selects the front-most one, Alt+click the next one behind); zoom; bigger handles.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('main preview editor: direct move / resize (T8.6)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Editor');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 30, g: 90, b: 220, alpha: 1 } } }).png().toBuffer();
    const inNode = (l: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${l}$`) }) });
    await inNode('Subject').locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: png });
    await inNode('Subject').locator('img.sc-thumb').waitFor();
    for (const l of ['Background', 'Subject']) await page.getByRole('button', { name: `Connect ${l}`, exact: true }).click();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    await page.locator('.react-flow__node-mainNode').getByRole('button', { name: 'Edit' }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const editor = () => page.getByRole('dialog', { name: /Main preview editor/ });
  const layer = (id: string) => editor().locator(`.sc-editor__canvas .sc-render [data-source-id="${id}"]`);
  const selection = async () => ((await editor().getByTestId('selection').count()) ? (await editor().getByTestId('selection').innerText()).replace('Selected: ', '') : null);
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  it('press-and-drag on an unselected asset selects and moves it in one gesture', async () => {
    expect(await selection()).toBeNull();
    const before = (await doc()).master.placements.subject;
    const c = await centre(layer('subject'));
    await page.mouse.move(c.x - 5, c.y - 5);
    await page.mouse.move(c.x, c.y);
    await editor().locator('.sc-editor__hover').waitFor(); // what a click would grab
    await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 25, { steps: 10 });
    await page.mouse.up();
    expect(await selection()).toBe('Subject');
    await expect.poll(async () => (await doc()).master.placements.subject?.x ?? 0, { timeout: 10_000 }).toBeGreaterThan((before?.x ?? 0) + 0.01);
    expect((await doc()).master.placements.subject?.y).toBeGreaterThan((before?.y ?? 0) + 0.005);
  }, 60_000);

  it('with the Background selected, a click on the Subject (in front) selects it', async () => {
    // A corner of the canvas: only the Background is there.
    const bg = await layer('background').boundingBox();
    if (!bg) throw new Error('no background');
    await page.mouse.click(bg.x + 6, bg.y + 6);
    expect(await selection()).toBe('Background');
    await page.mouse.click(...Object.values(await centre(layer('subject'))) as [number, number]);
    expect(await selection()).toBe('Subject');
  }, 30_000);

  it('Alt+click selects the next layer behind; a click on empty stage clears', async () => {
    const c = await centre(layer('subject'));
    await page.keyboard.down('Alt');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.up('Alt');
    expect(await selection()).toBe('Background');
    const stage = await editor().locator('.sc-editor__stage').boundingBox();
    if (!stage) throw new Error('no stage');
    await page.mouse.click(stage.x + 4, stage.y + 4);
    expect(await selection()).toBeNull();
  }, 30_000);

  it('handles are big enough to grab and resize', async () => {
    await page.mouse.click(...Object.values(await centre(layer('subject'))) as [number, number]);
    const handle = editor().locator('.moveable-control.moveable-se').first();
    const hb = await handle.boundingBox();
    expect(hb?.width ?? 0).toBeGreaterThanOrEqual(14);
    const before = (await doc()).master.placements.subject;
    const h = await centre(handle);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 50, h.y + 50, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await doc()).master.placements.subject?.w ?? 0, { timeout: 10_000 }).toBeGreaterThan((before?.w ?? 0) + 0.01);
  }, 60_000);

  it('zooms in and out; Fit goes back', async () => {
    const w0 = (await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0;
    await editor().getByRole('button', { name: 'Zoom in' }).click();
    const w1 = (await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0;
    expect(w1).toBeGreaterThan(w0 * 1.2);
    await editor().getByRole('button', { name: 'Fit' }).click();
    expect(Math.round((await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0)).toBe(Math.round(w0));
  }, 30_000);
});

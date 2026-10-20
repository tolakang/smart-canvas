/**
 * T8.6 end to end: the main preview editor moves and resizes assets directly on the canvas.
 * Press-and-drag moves an unselected asset in one gesture; the selection box doesn't hide the layers under
 * it (a click selects the front-most one, Alt+click the next one behind); zoom; bigger handles.
 * T10.1: Figma-style workspace — Design panel X/Y/W/H, size badge, Hand tool / Space pan, wheel pan, zoom at
 * the pointer, Shift+1 / Shift+0.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { mainComposition, type ProjectDoc } from '@smart-canvas/core';
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
    const before = mainComposition(await doc()).placements.subject;
    const c = await centre(layer('subject'));
    await page.mouse.move(c.x - 5, c.y - 5);
    await page.mouse.move(c.x, c.y);
    await editor().locator('.sc-editor__hover').waitFor(); // what a click would grab
    await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 25, { steps: 10 });
    await page.mouse.up();
    expect(await selection()).toBe('Subject');
    await expect.poll(async () => mainComposition(await doc()).placements.subject?.x ?? 0, { timeout: 10_000 }).toBeGreaterThan((before?.x ?? 0) + 0.01);
    expect(mainComposition(await doc()).placements.subject?.y).toBeGreaterThan((before?.y ?? 0) + 0.005);
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
    const before = mainComposition(await doc()).placements.subject;
    const h = await centre(handle);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 50, h.y + 50, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => mainComposition(await doc()).placements.subject?.w ?? 0, { timeout: 10_000 }).toBeGreaterThan((before?.w ?? 0) + 0.01);
  }, 60_000);

  it('zooms in and out; Fit goes back', async () => {
    const w0 = (await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0;
    await editor().getByRole('button', { name: 'Zoom in' }).click();
    const w1 = (await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0;
    expect(w1).toBeGreaterThan(w0 * 1.2);
    await editor().getByRole('button', { name: 'Fit' }).click();
    expect(Math.round((await editor().locator('.sc-editor__canvas').boundingBox())?.width ?? 0)).toBe(Math.round(w0));
  }, 30_000);

  const canvasBox = async () => {
    const b = await editor().locator('.sc-editor__canvas').boundingBox();
    if (!b) throw new Error('no canvas');
    return b;
  };
  const design = () => editor().getByRole('complementary', { name: 'Design' });

  it('Design panel: typed X / Y / W / H move and resize the layer; W keeps the image ratio', async () => {
    await page.keyboard.press('Shift+Digit1');
    await page.mouse.click(...(Object.values(await centre(layer('subject'))) as [number, number]));
    expect(await selection()).toBe('Subject');
    const master = mainComposition(await doc());
    const W = master.size.width; // px masters: design px = px
    const H = master.size.height;
    await design().getByLabel('X', { exact: true }).fill('100');
    await design().getByLabel('X', { exact: true }).press('Enter');
    await expect.poll(async () => (mainComposition(await doc()).placements.subject?.x ?? 0) * W, { timeout: 10_000 }).toBeCloseTo(100, 1);
    const before = mainComposition(await doc()).placements.subject;
    const ratio = ((before?.w ?? 1) * W) / ((before?.h ?? 1) * H);
    await design().getByLabel('Width', { exact: true }).fill('300');
    await design().getByLabel('Width', { exact: true }).press('Enter');
    await expect.poll(async () => (mainComposition(await doc()).placements.subject?.w ?? 0) * W, { timeout: 10_000 }).toBeCloseTo(300, 1);
    const after = mainComposition(await doc()).placements.subject;
    expect(((after?.w ?? 0) * W) / ((after?.h ?? 1) * H)).toBeCloseTo(ratio, 3);
    // Moveable's frame follows the typed values.
    await expect
      .poll(async () => {
        const [line, box] = await Promise.all([editor().locator('.moveable-control.moveable-se').first().boundingBox(), editor().getByTestId('selection-box').boundingBox()]);
        return Math.round((line?.x ?? 0) + (line?.width ?? 0) / 2 - ((box?.x ?? 0) + (box?.width ?? 0)));
      })
      .toBe(0);
    // The badge under the selection shows the size in design px.
    await expect.poll(() => editor().getByTestId('selection-size').innerText()).toMatch(/^300 × \d+$/);
  }, 60_000);

  it('Hand tool (H) and Space + drag pan the canvas; V goes back to selecting', async () => {
    const stage = await editor().locator('.sc-editor__stage').boundingBox();
    if (!stage) throw new Error('no stage');
    const b0 = await canvasBox();
    await page.keyboard.press('h');
    expect(await editor().getByRole('button', { name: 'Hand tool (H)' }).getAttribute('aria-pressed')).toBe('true');
    await page.mouse.move(stage.x + 40, stage.y + 40);
    await page.mouse.down();
    await page.mouse.move(stage.x + 100, stage.y + 70, { steps: 5 });
    await page.mouse.up();
    const b1 = await canvasBox();
    expect(b1.x - b0.x).toBeCloseTo(60, 0);
    expect(b1.y - b0.y).toBeCloseTo(30, 0);
    await page.keyboard.press('v');
    await page.keyboard.down('Space');
    await page.mouse.move(stage.x + 100, stage.y + 70);
    await page.mouse.down();
    await page.mouse.move(stage.x + 60, stage.y + 50, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const b2 = await canvasBox();
    expect(b2.x - b1.x).toBeCloseTo(-40, 0);
    expect(await editor().getByTestId('pan-surface').count()).toBe(0); // Space released: back to selecting
    // Plain wheel pans too.
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.wheel(0, 50);
    await expect.poll(async () => (await canvasBox()).y - b2.y).toBeCloseTo(-50, 0);
  }, 60_000);

  it('Ctrl + wheel zooms at the pointer; Shift+0 is 100%, Shift+1 fits', async () => {
    await page.keyboard.press('Shift+Digit1');
    const b0 = await canvasBox();
    const at = { x: b0.x + b0.width * 0.25, y: b0.y + b0.height * 0.25 };
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await canvasBox()).width).toBeGreaterThan(b0.width * 1.3);
    const b1 = await canvasBox();
    // The design point under the pointer stays under it.
    expect((at.x - b1.x) / b1.width).toBeCloseTo(0.25, 2);
    expect((at.y - b1.y) / b1.height).toBeCloseTo(0.25, 2);
    await page.keyboard.press('Shift+Digit0');
    expect(await editor().getByLabel('Zoom level').innerText()).toBe('100%');
    const master = mainComposition(await doc());
    expect((await canvasBox()).width).toBeCloseTo(master.size.width, 0);
    await page.keyboard.press('Shift+Digit1');
    expect(Math.round((await canvasBox()).width)).toBe(Math.round(b0.width));
    expect(Math.round((await canvasBox()).x)).toBe(Math.round(b0.x));
  }, 60_000);
});

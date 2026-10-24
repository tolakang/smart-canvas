/**
 * D36 end to end: the editor's transform box (Affinity-style). Drag an edge along itself to skew (the opposite
 * edge stays), outward to stretch; the shear is stored and drawn by the one renderer; a double-click on a
 * handle undoes what it changed — after any mix of stretch, skew, scale and rotate the layer lands back on
 * its original placement; moves snap to the canvas edges; on a phone (D58, Q7) the selected layer and its handles drag at once and a finger elsewhere moves the canvas.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { mainComposition, type NFrame, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('editor transform box (D36)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Transform');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 30, g: 90, b: 220, alpha: 1 } } }).png().toBuffer();
    await putPicture(page, 'Subject', { name: 's.png', mimeType: 'image/png', buffer: png });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    await openLayout(page);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const editor = () => page.getByRole('dialog', { name: /Master preview editor/ });
  const layer = () => editor().locator('.sc-editor__canvas .sc-render [data-source-id="subject"]');
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const placement = async () => mainComposition(await doc()).placements.subject as NFrame;
  const centre = async (sel: string) => {
    const b = await editor().locator(sel).boundingBox();
    if (!b) throw new Error(`${sel} not visible`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const handle = (h: string) => centre(`[data-tb-handle="${h}"]`);
  const drag = async (h: string, dx: number, dy: number, key?: string) => {
    const c = await handle(h);
    if (key) await page.keyboard.down(key);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 3, c.y + dy / 3, { steps: 4 });
    await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 });
    await page.mouse.up();
    if (key) await page.keyboard.up(key);
    await settle();
  };
  const dbl = async (h: string) => {
    const c = await handle(h);
    await page.mouse.click(c.x, c.y);
    await page.mouse.click(c.x, c.y);
    await settle();
  };
  /** Wait until the last edit is saved (an edit marks the board unsaved at once; the save is debounced). */
  const settle = async () => {
    await page.waitForTimeout(100);
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  };
  const near = (a: NFrame, b: NFrame) => {
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k]).toBeCloseTo(b[k], 4);
    expect(a.rotation ?? 0).toBeCloseTo(b.rotation ?? 0, 3);
    expect(a.shear ?? 0).toBeCloseTo(b.shear ?? 0, 3);
  };

  it('drag the right edge along itself: skew, left edge fixed; stored and drawn by the renderer', async () => {
    const c = await centre('.sc-editor__canvas .sc-render [data-source-id="subject"]');
    await page.mouse.click(c.x, c.y);
    const before = await placement();
    const w0 = await handle('w');
    await drag('e', 2, 60);
    const after = await placement();
    expect(Math.abs(after.shear ?? 0)).toBeGreaterThan(5);
    expect(after.rotation ?? 0).not.toBe(0); // a vertical skew is rotation + shear (Affinity's R and S)
    const w1 = await handle('w');
    expect(Math.hypot(w1.x - w0.x, w1.y - w0.y)).toBeLessThan(1.5);
    expect(await layer().evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/rotate\(.+\) skewX\(.+\)/);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/editor-skew.png` });
    // The Design panel shows it; a double-click on the edge undoes it exactly.
    expect(Number(await editor().getByRole('complementary', { name: 'Design' }).getByLabel('Skew', { exact: true }).inputValue())).not.toBe(0);
    await dbl('e');
    near(await placement(), before);
  }, 90_000);

  it('any mix of stretch, skew, scale and rotate: the four resets land on the original placement', async () => {
    const before = await placement();
    await drag('e', 40, 0); // stretch
    await drag('n', 30, 1); // skew
    await drag('se', 25, 25); // scale
    await drag('rotate', 60, 30); // rotate
    await drag('w', 1, 30); // skew
    const mixed = await placement();
    expect(mixed.shear ?? 0).not.toBe(0);
    for (const h of ['se', 'e', 'n', 'rotate']) await dbl(h);
    near(await placement(), before);
  }, 120_000);

  it('Alt: skew about the centre; the reset still lands in place', async () => {
    const before = await placement();
    await drag('n', 40, 0, 'Alt');
    const p = await placement();
    expect(p.x + p.w / 2).toBeCloseTo(before.x + before.w / 2, 4); // centre kept
    await dbl('n');
    near(await placement(), before);
  }, 60_000);

  it('a move snaps to the canvas edge (with a guide), and arrow nudges keep resets in place', async () => {
    const before = await placement();
    const canvas = await editor().locator('.sc-editor__canvas').boundingBox();
    const sel = await editor().getByTestId('selection-box').boundingBox();
    if (!canvas || !sel) throw new Error('no canvas');
    // Drag the layer so its left edge comes within ~3 screen px of the canvas's left edge.
    const c = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 };
    const dx = canvas.x + 3 - sel.x;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 2, c.y, { steps: 5 });
    await page.mouse.move(c.x + dx, c.y, { steps: 5 });
    expect(await editor().locator('.tb-guides line').count()).toBeGreaterThan(0);
    await page.mouse.up();
    await settle();
    expect((await placement()).x).toBeCloseTo(0, 5);
    // Nudge, stretch, reset: back to the nudged position (the nudge is kept, the stretch undone).
    await page.keyboard.press('ArrowRight');
    await settle();
    const nudged = await placement();
    await drag('e', 50, 0);
    await dbl('e');
    near(await placement(), nudged);
    expect(nudged.y).toBeCloseTo(before.y, 5);
  }, 90_000);

  it('N7: a resize snaps too — the right edge dragged near the canvas edge lands on it (with a guide); the left edge stays', async () => {
    const before = await placement();
    const canvas = await editor().locator('.sc-editor__canvas').boundingBox();
    const sel = await editor().getByTestId('selection-box').boundingBox();
    if (!canvas || !sel) throw new Error('no canvas');
    const c = await handle('e');
    const dx = canvas.x + canvas.width - 3 - (sel.x + sel.width);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 2, c.y, { steps: 5 });
    await page.mouse.move(c.x + dx, c.y, { steps: 5 });
    expect(await editor().locator('.tb-guides line').count()).toBeGreaterThan(0);
    await page.mouse.up();
    await settle();
    const after = await placement();
    expect(after.x + after.w).toBeCloseTo(1, 5);
    expect(after.x).toBeCloseTo(before.x, 5);
    await dbl('e');
    near(await placement(), before);
  }, 90_000);

  it('M2: a turned layer snaps when resized — its drawn right edge lands on the canvas edge; the resets put it back', async () => {
    const before = await placement();
    await drag('rotate', 70, 40, 'Shift');
    const turned = await placement();
    const deg = (((turned.rotation ?? 0) % 90) + 90) % 90;
    expect(deg).toBeGreaterThan(5);
    expect(deg).toBeLessThan(85);
    const canvas = await editor().locator('.sc-editor__canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const right = canvas.x + canvas.width;
    const edge = async () => {
      const b = await layer().boundingBox();
      return b ? b.x + b.width : 0;
    };
    // Drag the e handle outward along the layer's own axis until the drawn right edge reaches the canvas edge.
    const c = await handle('e');
    const w = await handle('w');
    const len = Math.hypot(c.x - w.x, c.y - w.y);
    const dir = { x: (c.x - w.x) / len, y: (c.y - w.y) / len };
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    let snapped = false;
    for (let i = 1; i < 400 && !snapped; i++) {
      await page.mouse.move(c.x + dir.x * i * 1.5, c.y + dir.y * i * 1.5);
      const e = await edge();
      if (Math.abs(e - right) < 0.75 && (await editor().locator('.tb-guides line').count()) > 0) snapped = true;
      if (e > right + 20) break;
    }
    await page.mouse.up();
    await settle();
    expect(snapped).toBe(true);
    expect(Math.abs((await edge()) - right)).toBeLessThan(0.75);
    expect((await placement()).rotation ?? 0).toBeCloseTo(turned.rotation ?? 0, 3);
    await dbl('e');
    await dbl('rotate');
    near(await placement(), before);
  }, 120_000);

  it('phone (D58, Q7): one finger on empty canvas pans; the selected layer and its handles drag at once; a double-tap resets; two fingers pinch; a double-tap on empty canvas fits', async () => {
    // The same signed-in session, as a phone.
    const ctx = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
    const phone = await ctx.newPage();
    const cdp = await ctx.newCDPSession(phone);
    await phone.goto(page.url().split('#')[0] + '#' + (page.url().split('#')[1] ?? ''));
    await phone.locator('.react-flow__node[data-id="main"]').getByRole('button', { name: /^Edit/ }).first().tap();
    const ed = phone.getByRole('dialog', { name: /Master preview editor/ });
    const canvasBox = async () => {
      const b = await ed.locator('.sc-editor__canvas').boundingBox();
      if (!b) throw new Error('no canvas');
      return b;
    };
    type Pt = { x: number; y: number };
    /** A scripted touch: each finger from its start to its end in 10 steps. */
    const fingers = async (paths: { from: Pt; to: Pt }[]) => {
      const at = (i: number) => paths.map((f, id) => ({ id, x: f.from.x + ((f.to.x - f.from.x) * i) / 10, y: f.from.y + ((f.to.y - f.from.y) * i) / 10 }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
        await phone.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phone.waitForTimeout(400);
    };
    const tap = async (p: Pt) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const centreOf = async (sel: string) => {
      const b = await ed.locator(sel).boundingBox();
      if (!b) throw new Error(`no ${sel}`);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    // A tap selects the layer (on lift).
    await tap(await centreOf('.sc-editor__canvas [data-source-id="subject"]'));
    await ed.locator('[data-tb-handle="e"]').waitFor();
    await phone.waitForTimeout(400);
    const before = await placement();
    // One finger on the empty stage around the canvas moves the canvas, and edits nothing.
    const c0 = await canvasBox();
    const empty = await phone.evaluate(() => {
      const stage = document.querySelector('.sc-editor__stage')?.getBoundingClientRect();
      if (!stage) throw new Error('no stage');
      for (let y = stage.y + 6; y < stage.bottom - 6; y += 6)
        for (let x = stage.x + 6; x < stage.right - 6; x += 6) if (document.elementFromPoint(x, y)?.classList.contains('sc-editor__stage')) return { x, y };
      throw new Error('no empty stage');
    });
    await fingers([{ from: empty, to: { x: empty.x + 40, y: empty.y + 30 } }]);
    const c1 = await canvasBox();
    expect(Math.round(c1.x - c0.x)).toBe(40);
    expect(Math.round(c1.y - c0.y)).toBe(30);
    near(await placement(), before);
    // No hold: a drag on the selected layer's edge handle skews at once.
    const e0 = await centreOf('[data-tb-handle="e"]');
    await fingers([{ from: e0, to: { x: e0.x + 2, y: e0.y + 40 } }]);
    await expect.poll(async () => Math.abs((await placement()).shear ?? 0), { timeout: 10_000 }).toBeGreaterThan(3);
    // Double-tap the edge: back to where it was.
    const e1 = await centreOf('[data-tb-handle="e"]');
    await tap(e1);
    await phone.waitForTimeout(60);
    await tap(e1);
    await expect.poll(async () => Math.abs((await placement()).shear ?? 0), { timeout: 10_000 }).toBeLessThan(1e-6);
    near(await placement(), before);
    await phone.waitForTimeout(400);
    // A drag on the selected layer moves it at once.
    const l0 = await centreOf('.sc-editor__canvas [data-source-id="subject"]');
    await fingers([{ from: l0, to: { x: l0.x + 30, y: l0.y + 20 } }]);
    await expect.poll(async () => (await placement()).x, { timeout: 10_000 }).toBeGreaterThan(before.x + 1e-4);
    const moved = await placement();
    expect(moved.w).toBeCloseTo(before.w, 6); // moved, not resized
    // Two fingers spread on the layer: the canvas zooms (about twice), nothing moves.
    const w0 = (await canvasBox()).width;
    const m = await centreOf('.sc-editor__canvas');
    await fingers([{ from: { x: m.x - 30, y: m.y }, to: { x: m.x - 60, y: m.y } }, { from: { x: m.x + 30, y: m.y }, to: { x: m.x + 60, y: m.y } }]);
    expect((await canvasBox()).width / w0).toBeGreaterThan(1.8);
    near(await placement(), moved);
    // A double-tap on empty canvas fits again.
    const empty2 = await phone.evaluate(() => {
      const stage = document.querySelector('.sc-editor__stage')?.getBoundingClientRect();
      if (!stage) throw new Error('no stage');
      for (let y = stage.y + 6; y < stage.bottom - 6; y += 6)
        for (let x = stage.x + 6; x < stage.right - 6; x += 6) if (document.elementFromPoint(x, y)?.classList.contains('sc-editor__stage')) return { x, y };
      throw new Error('no empty stage');
    });
    await tap(empty2);
    await phone.waitForTimeout(80);
    await tap(empty2);
    await expect.poll(async () => Math.round((await canvasBox()).width)).toBe(Math.round(w0));
    // Tapping the selected layer again picks the one behind it (a picture over the background).
    // (A tap on empty canvas clears the selection, so select the picture again first.)
    await phone.waitForTimeout(400);
    const pic = await centreOf('.sc-editor__canvas [data-source-id="subject"]');
    await tap(pic);
    const label = () => ed.getByTestId('selection').innerText();
    await ed.locator('[data-tb-handle="e"]').waitFor();
    const first = await label();
    await phone.waitForTimeout(400);
    await tap(pic);
    await expect.poll(label).not.toBe(first);
    near(await placement(), moved);
    await ctx.close();
  }, 90_000);
});

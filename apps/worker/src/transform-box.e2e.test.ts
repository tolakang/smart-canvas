/**
 * D36 end to end: the editor's transform box (Affinity-style). Drag an edge along itself to skew (the opposite
 * edge stays), outward to stretch; the shear is stored and drawn by the one renderer; a double-click on a
 * handle undoes what it changed — after any mix of stretch, skew, scale and rotate the layer lands back on
 * its original placement; moves snap to the canvas edges; on a phone a long press arms a handle or the layer first.
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

  it('phone: a quick drag edits nothing; long-press then drag skews (a handle) and moves (the layer); a double-tap resets', async () => {
    // The same signed-in session, as a phone.
    const ctx = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
    const phone = await ctx.newPage();
    const cdp = await ctx.newCDPSession(phone);
    await phone.goto(page.url().split('#')[0] + '#' + (page.url().split('#')[1] ?? ''));
    await phone.locator('.react-flow__node[data-id="main"]').getByRole('button', { name: /^Edit/ }).first().tap();
    const ed = phone.getByRole('dialog', { name: /Master preview editor/ });
    await ed.locator('.sc-editor__canvas [data-source-id="subject"]').tap();
    await ed.locator('[data-tb-handle="e"]').waitFor();
    const touch = (type: string, x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const tdrag = async (holdMs: number, dy: number) => {
      const b = await ed.locator('[data-tb-handle="e"]').boundingBox();
      if (!b) throw new Error('no handle');
      const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await touch('touchStart', c.x, c.y);
      await phone.waitForTimeout(holdMs);
      for (let i = 1; i <= 10; i++) {
        await touch('touchMove', c.x + i * 0.2, c.y + (dy * i) / 10);
        await phone.waitForTimeout(16);
      }
      await touch('touchEnd');
      await phone.waitForTimeout(300);
    };
    const before = await placement();
    // No hold: nothing changes (a swipe is not an edit).
    await tdrag(0, 40);
    await phone.waitForTimeout(500);
    near(await placement(), before);
    // Hold, then drag: the edge skews.
    await tdrag(450, 40);
    await expect.poll(async () => Math.abs((await placement()).shear ?? 0), { timeout: 10_000 }).toBeGreaterThan(3);
    // Double-tap the edge: back to where it was.
    const hb = await ed.locator('[data-tb-handle="e"]').boundingBox();
    if (!hb) throw new Error('no handle');
    const hc = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
    await touch('touchStart', hc.x, hc.y);
    await touch('touchEnd');
    await phone.waitForTimeout(60);
    await touch('touchStart', hc.x, hc.y);
    await touch('touchEnd');
    await expect.poll(async () => Math.abs((await placement()).shear ?? 0), { timeout: 10_000 }).toBeLessThan(1e-6);
    near(await placement(), before);
    // Long-press the layer itself, then drag: it moves.
    const lb = await ed.locator('.sc-editor__canvas [data-source-id="subject"]').boundingBox();
    if (!lb) throw new Error('no layer');
    const at = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
    await touch('touchStart', at.x, at.y);
    await phone.waitForTimeout(450);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', at.x + i * 3, at.y + i * 2);
      await phone.waitForTimeout(16);
    }
    await touch('touchEnd');
    await expect.poll(async () => (await placement()).x, { timeout: 10_000 }).toBeGreaterThan(before.x + 1e-4);
    expect((await placement()).w).toBeCloseTo(before.w, 6); // moved, not resized
    await ctx.close();
  }, 90_000);
});

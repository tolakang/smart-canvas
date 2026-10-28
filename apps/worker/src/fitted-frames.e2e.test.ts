/**
 * D37 end to end: a picture's frame hugs its visible pixels, and stretching it stretches the picture.
 * A badge PNG with wide transparent margins: once wired, its placement is fitted (the visible part, where it
 * was drawn), the editor's frame is the badge; dragging an edge outward distorts the picture with the frame.
 * Replacing the picture fits the new one into the old frame.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, mainComposition, type ExportJob, type NFrame, type ProjectDoc } from '@smart-canvas/core';
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

/** 400×300, transparent except a red 100×150 block at (200, 50). */
async function badge(): Promise<Buffer> {
  const block = await sharp({ create: { width: 100, height: 150, channels: 4, background: { r: 220, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: block, left: 200, top: 50 }])
    .png()
    .toBuffer();
}

describe.skipIf(!adminUrl)('picture frames fitted to their visible pixels (D37)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let teamId = '';
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const placement = async () => mainComposition(await doc()).placements.subject as NFrame;
  const saved = async () => {
    await page.waitForTimeout(150);
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  };

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Fitted');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    teamId = ids.teamId;
    await saved();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('after upload the frame hugs the badge: fitted, with the badge’s shape (1:1.5), not the default box', async () => {
    await putPicture(page, 'Subject', { name: 'badge.png', mimeType: 'image/png', buffer: await badge() });
    await expect.poll(async () => (await placement()).fitted ?? false, { timeout: 15_000 }).toBe(true);
    const p = await placement();
    const { width: W, height: H } = mainComposition(await doc()).size;
    expect((p.w * W) / (p.h * H)).toBeCloseTo(100 / 150, 2);
  }, 60_000);

  it('the editor frame is the badge; stretching the right edge stretches the picture', async () => {
    await openLayout(page);
    const editor = page.getByRole('dialog', { name: /Main Comps editor/ });
    const layer = editor.locator('.sc-editor__canvas .sc-render [data-source-id="subject"]');
    const lb = await layer.boundingBox();
    if (!lb) throw new Error('no layer');
    await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/fitted-before.png` });
    // The selection box is the layer's (fitted) frame.
    const sel = await editor.getByTestId('selection-box').boundingBox();
    expect(Math.abs((sel?.width ?? 0) - lb.width)).toBeLessThan(2);
    const before = await placement();
    const h = await editor.locator('[data-tb-handle="e"]').boundingBox();
    if (!h) throw new Error('no handle');
    const c = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y, { steps: 4 });
    await page.mouse.move(c.x + 90, c.y, { steps: 8 });
    // Live: while the edge is still held, the picture already stretches with the frame.
    await expect
      .poll(() => layer.locator('img').evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height))
      .toBeGreaterThan((400 / 300) * 1.3);
    await page.mouse.up();
    await saved();
    const after = await placement();
    expect(after.fitted).toBe(true);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/fitted-stretched.png` });
    expect(after.w).toBeGreaterThan(before.w * 1.3);
    expect(after.h).toBeCloseTo(before.h, 5);
    // The picture fills the stretched frame: the red block's width on screen follows the frame.
    const shown = await layer.boundingBox();
    const img = await layer.locator('img').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    // The full picture is 4× the visible block's width and 2× its height: its aspect is now stretched.
    expect(img.w / img.h).toBeGreaterThan((400 / 300) * 1.3);
    expect(Math.abs((shown?.width ?? 0) * 4 - img.w)).toBeLessThan(3);
    await editor.getByRole('button', { name: 'Close' }).click();
  }, 60_000);

  it('preview and export agree: the stretched badge (transparent margins) exports the same in the browser and on the worker', async () => {
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const r = addOutput(cur.doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1080, unit: 'px' } });
    if (!r.ok) throw new Error(r.error);
    expect((await page.request.put(url, { data: { rev: cur.rev, doc: r.doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Preview Post', { exact: true }).locator('.sc-render [data-source-id="subject"] img').waitFor();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Format').selectOption('png');
    await dialog.getByText('Made in your browser').waitFor();
    await dialog.getByRole('button', { name: /^Export 1 Preview/ }).click();
    const row = dialog.getByRole('list', { name: 'Export progress' }).locator('li');
    await expect.poll(() => row.getAttribute('data-status'), { timeout: 60_000 }).toBe('done');
    const [file] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Download' }).click()]);
    const inBrowser = readFileSync((await file.path()) as string);
    await dialog.getByRole('button', { name: 'Close' }).click();
    const [job] = (await (await page.request.post(`${url}/exports`, { data: { outputIds: ['post'], format: 'png', options: {} } })).json()) as ExportJob[];
    if (!job) throw new Error('no job');
    await expect.poll(async () => ((await (await page.request.get(`${url}/exports?ids=${job.id}`)).json()) as ExportJob[])[0]?.status, { timeout: 60_000 }).toBe('done');
    const onServer = Buffer.from(await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/exports/${job.id}/file`)).body());
    const [a, b] = await Promise.all([inBrowser, onServer].map((x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    const [da, db] = [a?.data ?? Buffer.alloc(0), b?.data ?? Buffer.alloc(0)];
    expect(da.length).toBe(db.length);
    let off = 0;
    let red = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(...[0, 1, 2, 3].map((k) => Math.abs((da[i + k] ?? 0) - (db[i + k] ?? 0))));
      if (d > 24) off++;
      if ((db[i] ?? 0) > 200 && (db[i + 1] ?? 0) < 60 && (db[i + 2] ?? 0) < 60) red++;
    }
    expect(off / (1080 * 1080)).toBeLessThan(0.002);
    expect(red).toBeGreaterThan(1000); // the badge is drawn
  }, 120_000);

  it('rotated, stretched, editor closed and reopened: a double-click on the edge brings back the picture’s shape', async () => {
    const editor = page.getByRole('dialog', { name: /Main Comps editor/ });
    const layer = editor.locator('.sc-editor__canvas .sc-render [data-source-id="subject"]');
    const handle = async (h: string) => {
      const b = await editor.locator(`[data-tb-handle="${h}"]`).boundingBox();
      if (!b) throw new Error(`no ${h} handle`);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const drag = async (h: string, dx: number, dy: number) => {
      const c = await handle(h);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + dx / 3, c.y + dy / 3, { steps: 4 });
      await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 });
      await page.mouse.up();
      await saved();
    };
    const open = async () => {
      await openLayout(page);
      const lb = await layer.boundingBox();
      if (!lb) throw new Error('no layer');
      await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
      await editor.locator('[data-tb-handle="e"]').waitFor();
    };
    const shape = async () => {
      const p = await placement();
      const { width: W, height: H } = mainComposition(await doc()).size;
      return { ratio: (p.w * W) / (p.h * H), rotation: p.rotation ?? 0, h: p.h };
    };
    await open();
    await drag('rotate', 60, 30);
    await drag('e', 60, 0);
    const stretched = await shape();
    expect(stretched.rotation).not.toBe(0);
    expect(Math.abs(stretched.ratio - 100 / 150)).toBeGreaterThan(0.2); // still stretched from the earlier test, and more
    await editor.getByRole('button', { name: 'Close' }).click();
    // A new editor session: the history of those drags is gone; the picture's own shape is not.
    await open();
    const c = await handle('e');
    await page.mouse.click(c.x, c.y);
    await page.mouse.click(c.x, c.y);
    await saved();
    const back = await shape();
    expect(back.ratio).toBeCloseTo(100 / 150, 3);
    expect(back.rotation).toBeCloseTo(stretched.rotation, 3); // the turn stays
    expect(back.h).toBeCloseTo(stretched.h, 6); // the left/right edge fixes the width, from the height
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/fitted-reset.png` });
    await editor.getByRole('button', { name: 'Close' }).click();
  }, 90_000);

  it('replacing the picture fits the new one into the old frame', async () => {
    const before = await placement();
    const wide = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 30, g: 30, b: 220, alpha: 1 } } }).png().toBuffer();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await boardNode(page, 'Image').getByRole('button', { name: 'Select Subject' }).click();
    await page.getByRole('complementary', { name: 'Inspector' }).locator('input[type=file]').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: wide });
    await expect
      .poll(async () => {
        const p = await placement();
        const { width: W, height: H } = mainComposition(await doc()).size;
        return p.fitted ? Math.round(((p.w * W) / (p.h * H)) * 100) / 100 : 0;
      }, { timeout: 15_000 })
      .toBe(3);
    const p = await placement();
    // Inside the old frame, same centre.
    expect(p.x + p.w / 2).toBeCloseTo(before.x + before.w / 2, 4);
    expect(p.w).toBeLessThanOrEqual(before.w + 1e-6);
  }, 60_000);
});

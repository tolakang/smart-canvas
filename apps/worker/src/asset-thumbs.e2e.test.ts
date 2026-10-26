/**
 * Asset node pictures sit whole inside their tiles: a tall or wide picture is scaled to fit, never stretched past
 * the tile and clipped (on the board and in the inspector's picture grid).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('Asset node pictures fit their tiles', () => {
  let stack: Stack;
  let page: Page;
  let wide: Buffer;
  let tall: Buffer;

  beforeAll(async () => {
    stack = await startStack();
    wide = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 220, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
    tall = await sharp({ create: { width: 100, height: 300, channels: 4, background: { r: 30, g: 60, b: 220, alpha: 1 } } }).png().toBuffer();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await setupAndCreateProject(page, stack.env.webUrl, 'Thumbs');
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const node = (title: string) => page.locator('.react-flow__node').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${title}$`) }) });
  /** How far each picture's drawn area pokes outside its tile, in px (0 when it fits). */
  const overflow = (scope: string) =>
    page.evaluate((sel) => {
      return [...document.querySelectorAll<HTMLImageElement>(`${sel} img`)].map((img) => {
        const tile = img.closest('.sc-slot__tile, .sc-assets__pick')?.getBoundingClientRect();
        const r = img.getBoundingClientRect();
        if (!tile) return 0;
        return Math.max(0, tile.left - r.left, r.right - tile.right, tile.top - r.top, r.bottom - tile.bottom);
      });
    }, scope);

  it('wide and tall pictures fit inside the Logo, Image, Background and Headline tiles', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    const both = [
      { name: 'wide.png', mimeType: 'image/png', buffer: wide },
      { name: 'tall.png', mimeType: 'image/png', buffer: tall },
    ];
    await node('Logo').locator('input[type=file][multiple]').first().setInputFiles(both);
    await node('Image').locator('input[type=file][multiple]').first().setInputFiles(both);
    await expect.poll(() => node('Image').locator('.sc-slot__pick img').count(), { timeout: 20_000 }).toBe(2);
    const bg = node('Background').locator('input[type=file]');
    for (const [i, buffer] of [tall, wide, wide].entries()) {
      await bg.nth(i).setInputFiles({ name: `bg-${i}.png`, mimeType: 'image/png', buffer });
      await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    }
    await expect.poll(() => node('Background').locator('.sc-slot__pick img').count(), { timeout: 20_000 }).toBe(3);
    await node('Headline').locator('input[type=file]').first().setInputFiles({ name: 'hl.png', mimeType: 'image/png', buffer: tall });
    await expect.poll(() => node('Headline').locator('.sc-slot__pick img').count(), { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => (await page.locator('.react-flow__node .sc-slot__pick img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete)))).toBe(true);
    const out = await overflow('.react-flow__node');
    expect(out.length).toBeGreaterThanOrEqual(8);
    for (const px of out) expect(px).toBeLessThan(1);
  }, 120_000);

  it('the inspector picture grid fits them too', async () => {
    await node('Image').locator('.sc-slot__pick img').last().click();
    await page.locator('.sc-assets--inspector img').first().waitFor();
    const out = await overflow('.sc-assets--inspector');
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (const px of out) expect(px).toBeLessThan(1);
  }, 60_000);
});

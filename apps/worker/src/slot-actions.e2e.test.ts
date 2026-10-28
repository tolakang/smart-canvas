/**
 * D67 (UX B8, F10): slot actions that don't collide. An empty slot's bar has Delete only (its tile is its Add); on
 * touch a selected slot's bar sits under its tile, not over the picture.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('slot actions that do not collide (D67)', () => {
  let stack: Stack;
  let page: Page;

  beforeAll(async () => {
    stack = await startStack();
    // A touch screen at desktop size: the board stays readable, and the slots use their touch layout.
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 }, hasTouch: true });
    await setupAndCreateProject(page, stack.env.webUrl, 'Slots');
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('an empty slot offers Delete only on its bar: the tile itself is the Add', async () => {
    const slot = boardNode(page, 'Image').locator('.sc-slot--empty').first();
    await slot.waitFor();
    expect(await slot.locator('.sc-slot__actions').getByLabel('Replace picture').count()).toBe(0);
    expect(await slot.locator('.sc-slot__actions').getByLabel('Add a picture').count()).toBe(0);
  }, 60_000);

  it('on touch, a tapped slot shows its bar under the tile', async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } }).png().toBuffer();
    await putPicture(page, 'Subject', { name: 'subject.png', mimeType: 'image/png', buffer: png });
    const node = boardNode(page, 'Image');
    await node.locator('.sc-slot__pick img').waitFor();
    await node.getByRole('button', { name: 'Select Subject' }).tap();
    const slot = node.locator('.sc-slot--focus');
    await slot.waitFor();
    const tile = (await slot.locator('.sc-slot__tile').boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const bar = (await slot.locator('.sc-slot__actions').boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    expect(bar.height).toBeGreaterThan(0);
    expect(bar.y).toBeGreaterThanOrEqual(tile.y + tile.height - 1);
  }, 60_000);
});

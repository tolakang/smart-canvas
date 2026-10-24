/**
 * Board nodes and the Delete key (D49 board). A picture's settings live in the inspector, its thumbnail fits
 * the node, and Delete / Backspace deletes the selected nodes —
 * one confirm, one undo step. In the master preview editor Delete removes the selected layer like its row's
 * trash button; in an output editor it hides the layer on that output.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('board cards and the Delete key', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Delete');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    // A wide picture: its thumbnail must still fit the card.
    const png = await sharp({ create: { width: 1600, height: 300, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
    await putPicture(page, 'Subject', { name: 'wide.png', mimeType: 'image/png', buffer: png });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await saved();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('a picture in the Image node fits it; its settings are in the inspector', async () => {
    const card = boardNode(page, 'Image');
    const [cardBox, thumbBox] = await Promise.all([card.boundingBox(), card.locator('img[alt="Subject preview"]').boundingBox()]);
    expect((thumbBox?.x ?? 0) + (thumbBox?.width ?? 0)).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
    await card.locator('.sc-node__title').click();
    await card.getByRole('button', { name: 'Select Subject' }).click();
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/board-cards.png` });
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    for (const name of ['Duplicate Subject', 'Save Subject to library', 'Delete Subject']) expect(await inspector.getByRole('button', { name }).count()).toBe(1);
    expect(await inspector.getByLabel('Subject behaves like').count()).toBe(1);
  }, 30_000);

  it('Delete deletes the selected node (after a confirm); the Layer Comp stays', async () => {
    page.once('dialog', (d) => void d.accept());
    await boardNode(page, 'Logo').locator('.sc-node__title').click();
    await page.keyboard.press('Delete');
    await boardNode(page, 'Logo').waitFor({ state: 'detached' });
    await saved();
    expect((await doc()).sources.some((s) => s.id === 'logo')).toBe(false);
    // Undo brings it back (one step).
    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Control+z');
    await boardNode(page, 'Logo').waitFor();
    // The Layer Comp can't be deleted: nothing is asked, nothing changes.
    let asked = false;
    const ask = (d: { dismiss: () => Promise<void> }) => ((asked = true), void d.dismiss());
    page.once('dialog', ask);
    await page.locator('.react-flow__node-mainNode .sc-node__title').first().click();
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    page.off('dialog', ask);
    expect(asked).toBe(false);
    expect(await page.locator('.react-flow__node-mainNode').count()).toBe(1);
  }, 60_000);

  it('Cancel in the confirm keeps the node', async () => {
    page.once('dialog', (d) => void d.dismiss());
    await boardNode(page, 'Logo').locator('.sc-node__title').click();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(await boardNode(page, 'Logo').count()).toBe(1);
  }, 30_000);

  it('master preview editor: Delete removes the selected layer (as its row trash button)', async () => {
    await openLayout(page);
    const editor = page.getByRole('dialog', { name: /Layer Comp editor/ });
    await editor.getByRole('complementary', { name: 'Layers' }).getByText('Headline', { exact: true }).click();
    page.once('dialog', (d) => void d.accept());
    await page.keyboard.press('Delete');
    await saved();
    expect((await doc()).sources.some((s) => s.id === 'headline')).toBe(false);
    expect(await editor.getByTestId('selection').count()).toBe(0);
  }, 60_000);
});

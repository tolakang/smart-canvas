/**
 * D74 (owner, 2026-11-02): a Logo node shows each logo as Square, Vertical and Horizontal slots. A vertical
 * Preview draws the logo's vertical picture; a square one keeps the main picture; an empty slot uses the square one.
 * D77 (owner, 2026-11-03): each row is a logo set; one set is in use, switched over the rows; a set is deleted by its row.
 */
import { readFileSync } from 'node:fs';
import type { ProjectDoc } from '@smart-canvas/core';
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, startStack, type Stack } from './test/stack';

const tinyPng = readFileSync(new URL('../../api/src/assets/fixtures/tiny.png', import.meta.url));
const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>');

describe.skipIf(!adminUrl)('Logo node: square, vertical and horizontal slots (D74)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(stack.env.webUrl);
    await page.getByText('First run? Set up the workspace').click();
    await page.getByLabel('Your name').fill('Ada');
    await page.getByLabel('Team name').fill('Studio');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByPlaceholder('New project name').fill('Logos');
    await dialog.getByRole('button', { name: /^IG sizes/ }).click();
    await dialog.getByRole('button', { name: /^Story sizes/ }).click();
    await dialog.locator('input[type=file]').setInputFiles([{ name: 'brand.svg', mimeType: 'image/svg+xml', buffer: logoSvg }]);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  /** The file a Preview draws for layer `id` (an img, or a fitted frame's img inside it, D37). */
  const logoSrc = (preview: string, id: string) => ({
    getAttribute: () =>
      page
        .getByLabel(`Preview ${preview}`, { exact: true })
        .locator(`.sc-render [data-source-id="${id}"]`)
        .first()
        .evaluate((el) => (el instanceof HTMLImageElement ? el : el.querySelector('img'))?.getAttribute('src') ?? ''),
  });

  it('each logo shows Square, Vertical and Horizontal; a vertical picture goes to vertical Previews only', async () => {
    const logo = boardNode(page, 'Logo');
    const slots = logo.getByRole('group', { name: 'brand: square, vertical and horizontal' });
    await slots.waitFor();
    // D77: the headings show once, over the rows; an empty slot shows only a faint + (its tooltip says the rest).
    for (const caption of ['Square', 'Vertical', 'Horizontal']) await logo.getByText(caption, { exact: true }).waitFor();
    expect(await slots.locator('.sc-slot--empty').count()).toBe(2);

    const brand = (await doc()).sources.find((s) => s.label === 'brand');
    if (!brand || brand.content.kind !== 'vector' || !brand.content.assetId) throw new Error('no logo');
    const main = brand.content.assetId;
    const story = (await doc()).outputs.find((o) => o.size.height > o.size.width * 1.5)?.label ?? '';
    const ig = (await doc()).outputs.find((o) => o.label !== story)?.label ?? '';

    await logo.getByLabel('Vertical logo for brand', { exact: true }).setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: tinyPng });
    await expect.poll(async () => {
      const s = (await doc()).sources.find((x) => x.id === brand.id);
      return s?.content.kind === 'vector' ? s.content.variants?.vertical ?? null : null;
    }, { timeout: 15_000 }).not.toBeNull();
    const d = await doc();
    const s = d.sources.find((x) => x.id === brand.id);
    const vertical = s?.content.kind === 'vector' ? s.content.variants?.vertical : undefined;
    expect(vertical).toBeTruthy();
    expect(await slots.locator('.sc-slot--empty').count()).toBe(1);

    // The Story Preview (vertical) draws the vertical picture; the IG one (square layout) keeps the main one.
    await expect.poll(() => logoSrc(story, brand.id).getAttribute(), { timeout: 15_000 }).toContain(vertical ?? '-');
    expect(await logoSrc(ig, brand.id).getAttribute()).toContain(main);

    // Cleared: the vertical Preview is back on the square picture.
    await logo.getByLabel('Clear vertical logo of brand', { exact: true }).dispatchEvent('click');
    await expect.poll(() => logoSrc(story, brand.id).getAttribute(), { timeout: 15_000 }).toContain(main);
  }, 90_000);

  it('D77: Add logo set adds an empty row; the switch draws that set instead, in the same place; its bin deletes it', async () => {
    const logo = boardNode(page, 'Logo');
    const brand = (await doc()).sources.find((s) => s.label === 'brand');
    if (!brand) throw new Error('no logo');
    const ig = (await doc()).outputs.find((o) => o.size.height <= o.size.width * 1.5)?.label ?? '';
    await logo.getByRole('button', { name: 'Add logo set' }).dispatchEvent('click');
    await expect.poll(() => logo.locator('.sc-logo-set').count()).toBe(2);
    const findSecond = async () => (await doc()).sources.find((s) => s.behavesLike === 'logo' && s.id !== brand.id && s.label === 'Logo 2');
    await expect.poll(async () => Boolean(await findSecond()), { timeout: 15_000 }).toBe(true);
    const second = await findSecond();
    if (!second) throw new Error('no second set');
    await logo.getByLabel('Replace Logo 2', { exact: true }).setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: tinyPng });
    await expect.poll(async () => {
      const s = (await doc()).sources.find((x) => x.id === second.id);
      return s?.content.kind === 'image' ? s.content.assetId ?? null : null;
    }, { timeout: 15_000 }).not.toBeNull();
    // Set 1 is still in use: the Preview draws brand, not the new set.
    expect(await page.getByLabel(`Preview ${ig}`, { exact: true }).locator(`.sc-render [data-source-id="${second.id}"]`).count()).toBe(0);
    await logo.getByRole('radiogroup', { name: 'Logo set in use' }).getByText('Set 2').click();
    await expect.poll(async () => (await doc()).stacks?.find((st) => st.kind === 'logo')?.use, { timeout: 15_000 }).toBe(second.id);
    await expect.poll(() => page.getByLabel(`Preview ${ig}`, { exact: true }).locator(`.sc-render [data-source-id="${second.id}"]`).count(), { timeout: 15_000 }).toBe(1);
    expect(await page.getByLabel(`Preview ${ig}`, { exact: true }).locator(`.sc-render [data-source-id="${brand.id}"]`).count()).toBe(0);
    // Deleting the set in use hands the logo back to the other set.
    page.once('dialog', (d) => void d.accept());
    await logo.getByRole('button', { name: 'Delete Set 2 of Logo' }).dispatchEvent('click');
    await expect.poll(() => logo.locator('.sc-logo-set').count()).toBe(1);
    await expect.poll(() => page.getByLabel(`Preview ${ig}`, { exact: true }).locator(`.sc-render [data-source-id="${brand.id}"]`).count(), { timeout: 15_000 }).toBe(1);
  }, 90_000);

  it('owner, 2026-11-03: the Preview editor neither lists nor draws an empty layer; Main Comps keeps it', async () => {
    const d = await doc();
    // A wired picture layer with no file yet (the Language node's Khmer headline on a new board).
    const empty = d.sources.find((x) => x.content.kind === 'image' && !x.content.assetId && x.visible && d.edges.some((e) => e.kind === 'layer' && e.from === x.id && e.to === 'main'));
    if (!empty) throw new Error('no empty layer');
    const ig = d.outputs.find((o) => o.size.height <= o.size.width * 1.5)?.label ?? '';
    const editor = page.getByRole('dialog', { name: `Preview editor ${ig}` });
    await page.getByRole('button', { name: `Edit Preview ${ig}` }).dispatchEvent('click');
    await editor.waitFor();
    const layers = editor.getByRole('complementary', { name: 'Layers' });
    await layers.locator('[data-layer]').first().waitFor();
    expect(await layers.locator(`[data-layer="${empty.id}"]`).count()).toBe(0);
    expect(await editor.locator(`.sc-render [data-source-id="${empty.id}"]`).count()).toBe(0);
    // The logo, which has a picture, is listed and drawn.
    expect(await layers.locator(`[data-layer="${d.sources.find((x) => x.label === 'brand')?.id}"]`).count()).toBe(1);
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
  }, 60_000);
});

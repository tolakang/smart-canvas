/**
 * D74 (owner, 2026-11-02): a Logo node shows each logo as Square, Vertical and Horizontal slots. A vertical
 * Preview draws the logo's vertical picture; a square one keeps the main picture; an empty slot uses the square one.
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
    for (const caption of ['Square', 'Vertical', 'Horizontal']) await slots.getByText(caption, { exact: true }).waitFor();
    expect(await slots.getByText('Same as square').count()).toBe(2);

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
    expect(await slots.getByText('Same as square').count()).toBe(1);

    // The Story Preview (vertical) draws the vertical picture; the IG one (square layout) keeps the main one.
    await expect.poll(() => logoSrc(story, brand.id).getAttribute(), { timeout: 15_000 }).toContain(vertical ?? '-');
    expect(await logoSrc(ig, brand.id).getAttribute()).toContain(main);

    // Cleared: the vertical Preview is back on the square picture.
    await logo.getByLabel('Clear vertical logo of brand', { exact: true }).dispatchEvent('click');
    await expect.poll(() => logoSrc(story, brand.id).getAttribute(), { timeout: 15_000 }).toContain(main);
  }, 90_000);
});

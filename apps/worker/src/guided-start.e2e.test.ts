/**
 * UX C1 (guided start, amends D49): "New project" takes the size families and the artwork, and the board opens with
 * a Preset node per family, its Previews, and the files in the Logo and Image nodes.
 */
import { readFileSync } from 'node:fs';
import type { ProjectDoc } from '@smart-canvas/core';
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, startStack, type Stack } from './test/stack';

const tinyPng = readFileSync(new URL('../../api/src/assets/fixtures/tiny.png', import.meta.url));
const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>');

describe.skipIf(!adminUrl)('guided start (UX C1)', () => {
  let stack: Stack;
  let page: Page;

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
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('picks sizes and artwork in New project; the board opens with them', async () => {
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByPlaceholder('New project name').fill('Guided');
    const gdn = dialog.getByRole('button', { name: /^GDN sizes/ });
    await gdn.click();
    expect(await gdn.getAttribute('aria-pressed')).toBe('true');
    await dialog.locator('input[type=file]').setInputFiles([
      { name: 'hero.png', mimeType: 'image/png', buffer: tinyPng },
      { name: 'brand.svg', mimeType: 'image/svg+xml', buffer: logoSvg },
    ]);
    await dialog.getByRole('list', { name: 'Files to add' }).getByText('brand.svg').waitFor();
    await dialog.getByText('7 sizes · 2 files').waitFor();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await page.locator('.sc-comp-group').waitFor();
    await page.locator('.react-flow__node-presetNode').filter({ hasText: 'GDN' }).waitFor();
    expect(await page.locator('.react-flow__node-outputNode').count()).toBe(7);
    expect(await boardNode(page, 'Logo').locator('.sc-slot').count()).toBe(1);
    expect(await boardNode(page, 'Image').locator('.sc-slot').count()).toBe(1);

    const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
    const { doc } = (await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`)).json()) as { doc: ProjectDoc };
    expect(doc.outputs).toHaveLength(7);
    expect(doc.sources.find((s) => s.label === 'brand')?.behavesLike).toBe('logo');
    expect(doc.sources.find((s) => s.label === 'hero')?.behavesLike).toBe('subject');
  }, 90_000);

  it('a template start hides the sizes and artwork', async () => {
    // The project above becomes a template through its ⋯ menu would take many steps; the API is enough here.
    const [, teamId = ''] = /#\/t\/([^/]+)\//.exec(page.url()) ?? [];
    const made = await page.request.post(`${stack.env.webUrl}api/teams/${teamId}/projects`, { data: { name: 'Base template', isTemplate: true } });
    expect(made.status()).toBe(201);
    await page.goto(`${stack.env.webUrl}#/`);
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByRole('button', { name: /^GDN sizes/ }).waitFor();
    await dialog.getByLabel('Base template').check();
    expect(await dialog.getByRole('button', { name: /^GDN sizes/ }).count()).toBe(0);
    expect(await dialog.getByText('Artwork (optional)').count()).toBe(0);
  }, 60_000);
});

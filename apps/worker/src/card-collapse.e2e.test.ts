/**
 * Owner, 2026-11-02: every card collapses to its header and expands again (the chevron before ⋯). Its wires stay
 * on, and the choice is remembered in this browser for the project.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, startStack, type Stack } from './test/stack';

const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>');

describe.skipIf(!adminUrl)('collapse and expand a card', () => {
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
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByPlaceholder('New project name').fill('Folds');
    await dialog.getByRole('button', { name: /^GDN sizes/ }).click();
    await dialog.locator('input[type=file]').setInputFiles([{ name: 'brand.svg', mimeType: 'image/svg+xml', buffer: logoSvg }]);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const preset = () => page.locator('.react-flow__node-presetNode').first();
  const edgeCount = () => page.locator('.react-flow__edge').count();

  it('a Preset node folds to its header; its wires to the Previews stay; it expands again', async () => {
    const edges = await edgeCount();
    const tall = (await preset().boundingBox())?.height ?? 0;
    const toggle = preset().getByRole('button', { name: 'Collapse GDN' });
    expect(await toggle.getAttribute('aria-expanded')).toBe('true');
    await toggle.click();
    const expand = preset().getByRole('button', { name: 'Expand GDN' });
    expect(await expand.getAttribute('aria-expanded')).toBe('false');
    await expect.poll(() => preset().getByRole('list', { name: 'GDN sizes' }).isVisible()).toBe(false);
    await expect.poll(async () => (await preset().boundingBox())?.height ?? 0).toBeLessThan(tall / 2);
    // Every wire is still drawn, with a real path.
    expect(await edgeCount()).toBe(edges);
    const paths = await page.locator('.react-flow__edge-path').evaluateAll((ps) => ps.map((p) => (p as SVGPathElement).getTotalLength()));
    expect(paths.every((l) => l > 0)).toBe(true);
    await expand.click();
    await expect.poll(() => preset().getByRole('list', { name: 'GDN sizes' }).isVisible()).toBe(true);
  }, 60_000);

  it('an asset node folds too, and the choice is kept after a reload', async () => {
    const logo = boardNode(page, 'Logo');
    await logo.focus();
    await page.keyboard.press('Enter'); // brought close (D69)
    await page.waitForTimeout(400);
    await logo.getByRole('button', { name: 'Collapse Logo' }).click();
    await expect.poll(() => logo.locator('.sc-slot').first().isVisible()).toBe(false);
    await page.reload();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    await boardNode(page, 'Logo').getByRole('button', { name: 'Expand Logo' }).waitFor();
    expect(await boardNode(page, 'Logo').locator('.sc-slot').first().isVisible()).toBe(false);
    await boardNode(page, 'Logo').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await boardNode(page, 'Logo').getByRole('button', { name: 'Expand Logo' }).click();
    await expect.poll(() => boardNode(page, 'Logo').locator('.sc-slot').first().isVisible()).toBe(true);
  }, 60_000);
});

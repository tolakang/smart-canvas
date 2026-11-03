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
  /** Waits until a panel stops moving (a Tidy glides panels into place, and a zoom moves them on screen). */
  const settled = async (el: ReturnType<Page['locator']>) => {
    let last = '';
    await expect
      .poll(async () => {
        const b = JSON.stringify(await el.boundingBox());
        const still = b === last;
        last = b;
        return still;
      }, { interval: 150, timeout: 5_000 })
      .toBe(true);
  };

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

  it('owner, 2026-11-03: the eye heading the sizes hides every Preview of the node at once, and shows them again', async () => {
    const previews = () => page.locator('.react-flow__node-outputNode').count();
    expect(await previews()).toBe(7);
    const all = preset().getByRole('button', { name: 'Hide all GDN Previews' });
    expect(await all.getAttribute('aria-pressed')).toBe('false');
    await all.click();
    await expect.poll(previews).toBe(0);
    // Each row's eye says so too; the sizes still export.
    expect(await preset().getByRole('button', { name: /^Show preview / }).count()).toBe(7);
    await preset().getByRole('button', { name: 'Show all GDN Previews' }).click();
    await expect.poll(previews).toBe(7);
  }, 60_000);

  it('owner, 2026-11-03: collapsing or expanding a card tidies the board — the panels under it close up, then make room again', async () => {
    const y = async () => (await preset().boundingBox())?.y ?? 0;
    const main = page.locator('.react-flow__node-mainNode');
    const before = await y();
    await main.getByRole('button', { name: 'Collapse Main Comps' }).click();
    await expect.poll(y, { timeout: 5_000 }).toBeLessThan(before - 50);
    await page.getByText('Board tidied').waitFor();
    await main.getByRole('button', { name: 'Expand Main Comps' }).click();
    await expect.poll(async () => Math.abs((await y()) - before), { timeout: 5_000 }).toBeLessThan(4);
  }, 60_000);

  it('an asset node folds too, and the choice is kept after a reload', async () => {
    const logo = boardNode(page, 'Logo');
    await logo.focus();
    await page.keyboard.press('Enter'); // brought close (D69)
    await settled(logo);
    await logo.getByRole('button', { name: 'Collapse Logo' }).click();
    await expect.poll(() => logo.locator('.sc-slot').first().isVisible()).toBe(false);
    await page.reload();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    await boardNode(page, 'Logo').getByRole('button', { name: 'Expand Logo' }).waitFor();
    expect(await boardNode(page, 'Logo').locator('.sc-slot').first().isVisible()).toBe(false);
    await boardNode(page, 'Logo').focus();
    await page.keyboard.press('Enter');
    await settled(boardNode(page, 'Logo'));
    await boardNode(page, 'Logo').getByRole('button', { name: 'Expand Logo' }).click();
    await expect.poll(() => boardNode(page, 'Logo').locator('.sc-slot').first().isVisible()).toBe(true);
  }, 60_000);
});

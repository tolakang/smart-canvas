/**
 * Owner, 2026-11-03 ("Study the best practice of the layout edit in the Main Comps"; "Go all four, layouts first"):
 * D81 — Main Comps shows its layouts as small live pictures in their own shapes, with how many sizes follow each.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('layouts in Main Comps (D81)', () => {
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
    await dialog.getByPlaceholder('New project name').fill('Layouts');
    await dialog.getByRole('button', { name: /^GDN sizes/ }).click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const card = () => page.locator('.react-flow__node-mainNode');
  const layout = (name: string) => card().getByRole('button', { name: `Edit ${name} layout` });

  it('each layout is a picture in its own shape, named, with the sizes that follow it; Square is the master', async () => {
    await expect.poll(() => card().locator('.sc-comp__layout .sc-render').count()).toBe(3);
    const shape = async (name: string) => {
      const b = await layout(name).locator('.sc-render').boundingBox();
      return b ? b.width / b.height : 0;
    };
    expect(await shape('Square')).toBeCloseTo(1, 1);
    expect(await shape('Vertical')).toBeLessThan(0.8);
    expect(await shape('Horizontal')).toBeGreaterThan(1.3);
    expect(await layout('Square').innerText()).toContain('master');
    // GDN: 7 sizes, each counted under the layout its row picks (S · V · H).
    const counts = await Promise.all(['Square', 'Vertical', 'Horizontal'].map(async (n) => Number(/(\d+) sizes?/.exec(await layout(n).innerText())?.[1] ?? -1)));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(7);
  }, 60_000);

  it('a click opens that layout', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await layout('Horizontal').click();
    await page.getByRole('dialog').first().waitFor();
    await page.keyboard.press('Escape');
  }, 60_000);
});

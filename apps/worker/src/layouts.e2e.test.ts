/**
 * Owner, 2026-11-03 ("Study the best practice of the layout edit in the Main Comps"; "Go all four, layouts first"):
 * D81 — Main Comps shows its layouts as small live pictures in their own shapes, with how many sizes follow each.
 * D82 — the layout editor switches layouts by tabs, shows the sizes that follow the open one, and marks a layer moved
 * there (Follow Square again undoes it).
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

  it('D82: the layout editor switches layouts by tabs, keeping the selection; Used by lists the sizes that follow it', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    const counts = Object.fromEntries(await Promise.all(['Square', 'Vertical', 'Horizontal'].map(async (n) => [n, Number(/(\d+) sizes?/.exec(await layout(n).innerText())?.[1] ?? -1)] as const)));
    await layout('Horizontal').click();
    const editor = page.getByRole('dialog').first();
    const tabs = editor.getByRole('tablist', { name: 'Layouts' });
    await expect.poll(() => tabs.getByRole('tab', { selected: true }).innerText()).toContain('Horizontal');
    expect(await editor.getByRole('group', { name: 'Sizes that use the Horizontal layout' }).getByRole('button').count()).toBe(counts.Horizontal);
    await editor.getByRole('complementary', { name: 'Layers' }).getByRole('button', { name: /^Background/ }).click();
    await tabs.getByRole('tab', { name: /^Vertical/ }).click();
    await expect.poll(() => tabs.getByRole('tab', { selected: true }).innerText()).toContain('Vertical');
    expect(await editor.getByText('Selected: Background').count()).toBe(1);
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
  }, 60_000);

  it('D82: a layer moved in a layout says so; Follow Square again puts it back where Square puts it', async () => {
    await layout('Horizontal').click();
    const editor = page.getByRole('dialog').first();
    const layers = editor.getByRole('complementary', { name: 'Layers' });
    const row = layers.locator('[data-layer]').filter({ hasText: 'Text 1' });
    await row.getByRole('button', { name: /^Text 1/ }).click();
    expect(await row.locator('.sc-layer__moved').count()).toBe(0);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => row.locator('.sc-layer__moved').count()).toBe(1);
    await editor.getByRole('button', { name: 'Follow Square again' }).click();
    await expect.poll(() => row.locator('.sc-layer__moved').count()).toBe(0);
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
  }, 60_000);
});

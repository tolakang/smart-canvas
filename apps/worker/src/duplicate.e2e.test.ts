/**
 * T8.2 end to end: duplicate inputs from the canvas — right-click an input node (Duplicate / Hide / Delete)
 * and Ctrl+D on the selected nodes. One undo step per duplicate action.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('duplicate inputs from the canvas (T8.2)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Dup');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const labels = async () => ((await (await page.request.get(url)).json()).doc as ProjectDoc).sources.map((s) => s.label).sort();
  const node = (label: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${label}$`) }) });
  const menu = () => page.getByRole('menu');

  // D49: on the page-3 board the standalone input is the Background node; pictures and text live in their nodes.
  const copies = async () => (await labels()).filter((l) => l === 'Background copy').length;

  it('right-click the Background node → Duplicate', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await node('Background').locator('.sc-node__title').click({ button: 'right' });
    await expect.poll(() => menu().getByRole('menuitem').allInnerTexts()).toEqual(['Duplicate', 'Hide', 'Delete']);
    await menu().getByRole('menuitem', { name: 'Duplicate' }).click();
    expect(await menu().count()).toBe(0);
    await node('Background copy').waitFor();
    await saved();
    expect(await copies()).toBe(1);
  }, 60_000);

  it('Escape or a click elsewhere closes the menu', async () => {
    await node('Background').locator('.sc-node__title').click({ button: 'right' });
    await menu().waitFor();
    await page.keyboard.press('Escape');
    expect(await menu().count()).toBe(0);
    await node('Background').locator('.sc-node__title').click({ button: 'right' });
    await menu().waitFor();
    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    expect(await menu().count()).toBe(0);
  }, 30_000);

  it('Ctrl+D duplicates the selected node, and one undo removes it', async () => {
    await node('Background').locator('.sc-node__title').click();
    await page.keyboard.press('Control+d');
    await expect.poll(copies).toBe(2);
    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Control+z');
    await saved();
    await expect.poll(copies).toBe(1);
  }, 60_000);

  it('the menu deletes after a confirm', async () => {
    await node('Background copy').first().locator('.sc-node__title').click({ button: 'right' });
    page.once('dialog', (d) => void d.accept());
    await menu().getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(() => node('Background copy').count()).toBe(0);
    await saved();
    expect(await copies()).toBe(0);
  }, 60_000);
});

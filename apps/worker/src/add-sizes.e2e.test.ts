/**
 * UX B2 (F3): a new project leads to the sizes step. With no Previews the Export Group offers the size families as
 * one-tap chips (not three empty drop sections), the overview lists three steps, and Export says why it waits; a chip
 * adds that family's Preset node and its Previews.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('Add sizes from the empty Export Group (UX B2)', () => {
  let stack: Stack;
  let page: Page;

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await setupAndCreateProject(page, stack.env.webUrl, 'Sizes');
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const group = () => page.locator('[aria-label="Export Group"]').first();

  it('a new project: family chips, the three steps, and Export says to add sizes first', async () => {
    await expect.poll(() => group().getByRole('list', { name: 'Add sizes' }).getByRole('button').count()).toBeGreaterThan(3);
    expect(await group().getByText('Drop a Preview here').count()).toBe(0);
    const steps = page.getByRole('list', { name: 'Getting started' });
    expect(await steps.getByRole('listitem').count()).toBe(3);
    expect(await steps.locator('[aria-current="step"]').innerText()).toContain('Add your artwork');
    const exp = page.getByRole('button', { name: 'Export', exact: true });
    expect(await exp.isDisabled()).toBe(true);
    expect(await exp.getAttribute('title')).toMatch(/^Add sizes first/);
  }, 60_000);

  it('a family chip adds its Preset node; the Export Group then sorts its Previews', async () => {
    await group().getByRole('button', { name: /^Add GDN sizes/ }).click();
    await expect.poll(() => page.locator('.react-flow__node-presetNode').filter({ has: page.locator('.sc-node__title', { hasText: /^GDN$/ }) }).count()).toBe(1);
    await expect.poll(() => group().getByRole('list', { name: 'Add sizes' }).count()).toBe(0);
    await expect.poll(() => group().locator('.sc-rule__chip').count()).toBeGreaterThan(1);
    expect(await page.getByRole('button', { name: 'Export', exact: true }).isDisabled()).toBe(false);
  }, 60_000);
});

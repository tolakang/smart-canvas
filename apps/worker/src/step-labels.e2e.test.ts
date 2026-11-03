/**
 * UX C2, option A (owner, 2026-11-03): the board names its three steps — Assets, Main Comps, Sizes — at the left of
 * their rows, at any zoom, and the labels never take a click.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('step labels on the board (C2 A)', () => {
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
    await dialog.getByPlaceholder('New project name').fill('Steps');
    await dialog.getByRole('button', { name: /^GDN sizes/ }).click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    await page.getByRole('button', { name: /^Fit all/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const box = async (sel: string) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`no ${sel}`);
    return b;
  };

  it('each row is named at its left, top first, the three ending in one column left of the board', async () => {
    await expect.poll(() => page.locator('.sc-step__label').allInnerTexts()).toEqual(['Assets', 'Main Comps', 'Sizes']);
    const [assets, main, sizes] = await Promise.all(['.sc-step--assets span', '.sc-step--main span', '.sc-step--sizes span'].map(box));
    if (!assets || !main || !sizes) throw new Error('no labels');
    expect(assets.y).toBeLessThan(main.y);
    expect(main.y).toBeLessThan(sizes.y);
    const right = (b: { x: number; width: number }) => b.x + b.width;
    expect(Math.abs(right(assets) - right(sizes))).toBeLessThan(2);
    // Left of every panel, and level with its row's top.
    const left = Math.min(...(await page.locator('.react-flow__node:not([data-id^="grp:"])').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().left))));
    expect(right(assets)).toBeLessThan(left);
    expect(Math.abs(sizes.y - (await box('.react-flow__node-presetNode')).y)).toBeLessThan(4);
  }, 60_000);

  it('a label keeps its screen size at any zoom and never takes a click', async () => {
    const before = (await box('.sc-step--main span')).height;
    await page.getByRole('button', { name: /^Zoom in/ }).click();
    await page.waitForTimeout(400);
    expect(Math.abs((await box('.sc-step--main span')).height - before)).toBeLessThan(1);
    // A label takes no pointer: the canvas under it is what a click there reaches.
    const label = await box('.sc-step--main span');
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane') ?? false, { x: label.x + label.width / 2, y: label.y + label.height / 2 })).toBe(true);
  }, 60_000);
});

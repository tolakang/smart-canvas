/**
 * UX A1, A2, A7 (F1, F2, F19): the board by keyboard. Tab reaches a card's "Add or drop pictures" area and an empty
 * slot, and Enter or Space opens the file picker; a card reached with Tab shows a ring; wires and React Flow's credit
 * link are not Tab stops.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('the board by keyboard (UX A1, A2, A7)', () => {
  let stack: Stack;
  let page: Page;

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await setupAndCreateProject(page, stack.env.webUrl, 'Keys');
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('Enter and Space on a drop area or an empty slot open the file picker', async () => {
    // One listener for the whole test: Playwright intercepts file pickers only while one is attached, and turning that
    // on per press races the press. Each picker is closed with no file (Chromium opens no second one while it waits).
    const pickers: boolean[] = [];
    page.on('filechooser', (fc) => {
      pickers.push(fc.isMultiple());
      void fc.setFiles([]);
    });
    // Let the interception switch on before the first press.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
    const zone = boardNode(page, 'Image').locator('.sc-dropzone');
    await expect.poll(() => zone.getAttribute('tabindex')).toBe('0');
    for (const key of ['Enter', 'Space']) {
      const before = pickers.length;
      await zone.focus();
      await page.keyboard.press(key);
      await expect.poll(() => pickers.length, { timeout: 10_000 }).toBe(before + 1);
      expect(pickers.at(-1)).toBe(true);
    }
    const before = pickers.length;
    await page.locator('.react-flow__node .sc-slot--empty label.sc-slot__pick').first().focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => pickers.length, { timeout: 10_000 }).toBe(before + 1);
  }, 60_000);

  it('a card reached with Tab shows the accent ring; wires and the credit link are not Tab stops', async () => {
    expect(await page.locator('.react-flow__edge[tabindex="0"]').count()).toBe(0);
    expect(await page.locator('.react-flow__attribution a').getAttribute('tabindex')).toBe('-1');
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    // Tab until a card has focus (the top bar and side panels come first).
    let outline = '';
    for (let i = 0; i < 80 && !outline; i++) {
      await page.keyboard.press('Tab');
      outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.classList.contains('react-flow__node') ? getComputedStyle(el).outlineStyle : '';
      });
    }
    expect(outline).toBe('solid');
  }, 60_000);
});

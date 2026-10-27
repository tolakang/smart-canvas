/**
 * CSS parity (P28, TAILWIND-PLAN.md): a tablet width, and a touch phone (the board, an editor, Projects, sign-in).
 * Each screen is drawn with this branch's CSS and with main's, and every computed style and pixel must match. Runs on
 * its own stack and seeded project (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIME, limit, paritySuite } from './test/parity-suite';

describe.skipIf(!adminUrl)('CSS parity: tablet and phone', () => {
  const { s, same, node, imagesLoaded, fit, seed } = paritySuite();
  let page: Page;
  beforeAll(async () => {
    page = s.page;
    await seed();
  }, limit(180_000));

  it('tablet width: the board, its top bar short (1100 px and narrower)', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await fit();
    await same('tablet-board');
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menu').waitFor();
    await same('tablet-add-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    await page.getByRole('complementary', { name: 'Inspector' }).waitFor();
    await same('tablet-inspector');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await fit();
  }, limit(60_000));

  it('phone: the board and a Preview editor', async () => {
    // A touch phone: `pointer: coarse` and `hover: none` hold, as on a real one (Tailwind's hover: depends on it).
    const phone = await s.stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
    page = s.page = await phone.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse) and (hover: none)').matches)).toBe(true);
    await page.goto(s.board);
    await node('Image').waitFor();
    await imagesLoaded();
    await same('phone-board');
    await node('Text').getByRole('textbox').first().focus();
    await same('phone-text-focus');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    await page.getByRole('complementary', { name: 'Inspector' }).waitFor();
    await page.waitForTimeout(400);
    await same('phone-inspector');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.getByRole('button', { name: /^More/ }).first().click();
    await page.getByRole('menuitem', { name: 'History' }).click();
    await page.getByRole('complementary', { name: 'History' }).waitFor();
    await page.waitForTimeout(400);
    await same('phone-history');
    await page.getByRole('button', { name: 'Close history' }).click();
    // On touch the first tap on a small panel zooms to it (Q8); the next one opens the editor.
    const editor = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await expect
      .poll(
        async () => {
          if (await editor.isVisible()) return true;
          await page.getByRole('button', { name: 'Edit Preview Banner' }).click({ force: true });
          await page.waitForTimeout(600);
          return editor.isVisible();
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await imagesLoaded();
    await same('phone-preview-editor');
    await page.goto(s.stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    await imagesLoaded();
    await same('phone-projects');
    const out = await s.stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page = s.page = await out.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(s.stack.env.webUrl);
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await same('phone-sign-in');
  }, limit(60_000));
});

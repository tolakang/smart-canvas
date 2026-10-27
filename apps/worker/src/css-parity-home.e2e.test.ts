/**
 * CSS parity (P28, TAILWIND-PLAN.md): first run, Projects home, sign-in. Each screen is drawn with this branch's CSS
 * and with main's, and every computed style and pixel must match. Its own stack: the first-run screen needs an empty
 * database, so the project is seeded after it (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIME, limit, paritySuite } from './test/parity-suite';

describe.skipIf(!adminUrl)('CSS parity: first run, Projects home, sign-in', () => {
  const { s, same, imagesLoaded, seed } = paritySuite();
  let page: Page;
  beforeAll(() => {
    page = s.page;
  });

  it('first-run screen', async () => {
    await page.goto(s.stack.env.webUrl);
    await page.getByText('First run? Set up the workspace').waitFor();
    await same('first-run');
  }, limit(60_000));

  it('Projects home (a row and a template hovered, search, nothing found), the Team and Size presets dialogs', async () => {
    await seed();
    // A template, so the Templates cards (and New project's "Start from") show.
    expect((await page.request.post(`${s.api}/duplicate`, { data: { name: 'Summer template', isTemplate: true } })).ok()).toBe(true);
    await page.goto(s.stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    await imagesLoaded();
    await same('projects');
    await page.locator('.sc-home__section > .sc-rows > li').first().hover();
    await same('projects-row-hover');
    await page.locator('.sc-tcard').first().hover();
    await same('template-hover');
    const search = page.getByRole('searchbox', { name: 'Search projects' });
    await search.click();
    await same('projects-search');
    await search.fill('nothing like this');
    await same('projects-none');
    await search.fill('');
    await page.mouse.move(5, 5);
    await page.getByRole('button', { name: /^More actions for / }).first().click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('dialog', { name: /^Rename/ }).waitFor();
    await same('ask-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('dialog', { name: 'New project' }).waitFor();
    await same('new-project-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByRole('dialog', { name: /Team/ }).waitFor();
    await same('team-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Size presets' }).click();
    await page.getByRole('dialog').waitFor();
    await same('presets-dialog');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('sign-in screen', async () => {
    const signedIn = page;
    const out = await s.stack.env.browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = s.page = await out.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(s.stack.env.webUrl);
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await same('sign-in');
    await out.close();
    page = s.page = signedIn;
  }, limit(60_000));
});

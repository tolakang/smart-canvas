/**
 * D62 project history on the board: a version is kept before inputs are deleted; the History panel lists it, shows it
 * read-only, and Restore brings it back (a board open elsewhere is told to reload). Editors name versions; viewers
 * see and preview them, with no Restore.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('project history (D62)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let board = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'History');
    teamId = ids.teamId;
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    board = page.url();
    await saved(page);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const saved = (p: Page) => p.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const history = (p: Page) => p.getByRole('complementary', { name: 'History' });

  it('deleting a card keeps the board before it; preview shows it read-only; Restore brings it back', async () => {
    page.once('dialog', (d) => void d.accept());
    await boardNode(page, 'Logo').locator('.sc-node__title').click();
    await page.keyboard.press('Delete');
    await boardNode(page, 'Logo').waitFor({ state: 'detached' });
    await saved(page);

    // Another tab with the project open (it will be told to reload after the restore).
    const otherCtx = await stack.env.browser.newContext({ viewport: { width: 1400, height: 900 } });
    await otherCtx.addCookies(await page.context().cookies());
    const other = await otherCtx.newPage();
    await other.goto(board);
    await other.locator('.sc-comp-group').waitFor();

    await page.getByRole('button', { name: 'History' }).click();
    const row = history(page).getByRole('button', { name: /Before deleting 1 input/ });
    await row.waitFor();
    await row.click();
    const bar = page.locator('.sc-board__version');
    await bar.getByText(/Version from/).waitFor();
    await boardNode(page, 'Logo').waitFor(); // the version has it
    expect(await page.getByRole('button', { name: '+ Add' }).count()).toBe(0); // read-only
    expect(await page.getByRole('button', { name: 'Undo' }).count()).toBe(0);
    expect(await history(page).getByLabel('Version name').count()).toBe(0); // naming is for the live board
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/history-preview.png` });

    await bar.getByRole('button', { name: 'Restore' }).click();
    await bar.waitFor({ state: 'detached' });
    await boardNode(page, 'Logo').waitFor();
    expect(await page.getByRole('button', { name: '+ Add' }).count()).toBe(1); // editable again
    expect((await doc()).sources.some((s) => s.id === 'logo')).toBe(true);
    await history(page).getByRole('button', { name: /Before restore/ }).waitFor();

    // The other tab's next save is refused: it offers the latest instead of overwriting the restore.
    other.once('dialog', (d) => void d.accept());
    await boardNode(other, 'Headline').locator('.sc-node__title').click();
    await other.keyboard.press('Delete');
    await other.getByRole('status').getByText('Someone else saved a newer version.').waitFor({ timeout: 15_000 });
    await other.getByRole('button', { name: 'Reload latest' }).click();
    await boardNode(other, 'Logo').waitFor();
    await boardNode(other, 'Headline').waitFor();
    await otherCtx.close();
  }, 90_000);

  it('Close goes back to the live board; an editor names a version and deletes it', async () => {
    const panel = history(page);
    await panel.getByRole('button', { name: /Auto-saved|Before/ }).first().click();
    await page.locator('.sc-board__version').getByRole('button', { name: 'Close' }).click();
    await page.locator('.sc-board__version').waitFor({ state: 'detached' });
    await panel.getByLabel('Version name').fill('Sent to client');
    await panel.getByRole('button', { name: 'Save version' }).click();
    await panel.getByRole('button', { name: /^Sent to client/ }).waitFor();
    page.once('dialog', (d) => void d.accept());
    await panel.getByRole('button', { name: 'Delete version Sent to client' }).click();
    await panel.getByRole('button', { name: /^Sent to client/ }).waitFor({ state: 'detached' });
    await panel.getByRole('button', { name: 'Close history' }).click();
    await panel.waitFor({ state: 'detached' });
    await page.getByRole('complementary', { name: 'Inspector' }).waitFor(); // back in its place
  }, 60_000);

  it('a viewer sees and previews versions, with no Restore and no naming', async () => {
    const invite = await page.request.post(`${stack.env.webUrl}api/teams/${teamId}/invites`, { data: { role: 'viewer' } });
    const { token } = (await invite.json()) as { token: string };
    const ctx = await stack.env.browser.newContext({ viewport: { width: 1400, height: 900 } });
    try {
      const accepted = await ctx.request.post(`${stack.env.webUrl}api/invites/${token}/accept`, { data: { email: 'vee@example.com', password: 'password123', name: 'Vee' } });
      expect(accepted.ok()).toBe(true);
      const vee = await ctx.newPage();
      await vee.goto(board);
      await vee.locator('.sc-comp-group').waitFor();
      await vee.getByRole('button', { name: 'History' }).click();
      expect(await history(vee).getByLabel('Version name').count()).toBe(0);
      await history(vee).getByRole('button', { name: /Before deleting 1 input/ }).click();
      const bar = vee.locator('.sc-board__version');
      await bar.getByText(/Version from/).waitFor();
      expect(await bar.getByRole('button', { name: 'Restore' }).count()).toBe(0);
      await bar.getByRole('button', { name: 'Close' }).click();
      await bar.waitFor({ state: 'detached' });
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('on a phone, History is in the More menu and opens as a sheet', async () => {
    const ctx = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      await ctx.addCookies(await page.context().cookies());
      const phone = await ctx.newPage();
      await phone.goto(board);
      await phone.locator('.sc-comp-group').waitFor();
      await phone.getByRole('button', { name: 'More' }).click();
      await phone.getByRole('menuitem', { name: 'History' }).click();
      const sheet = history(phone);
      await sheet.getByRole('button', { name: /Before deleting 1 input/ }).waitFor();
      expect(await sheet.evaluate((el) => el.classList.contains('sc-floating--sheet'))).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

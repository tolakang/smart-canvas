/**
 * T7.7 end to end: an admin invites people from the Team dialog, a new person joins through the link,
 * the admin changes their role and revokes an unused invite; a used link is dead.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('team and invites (T7.7)', () => {
  let stack: Stack;
  let browser: Browser;
  let admin: Page;
  let link = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    browser = stack.env.browser;
    admin = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    ({ teamId } = await setupAndCreateProject(admin, stack.env.webUrl, 'Poster'));
    await admin.goto(stack.env.webUrl);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const team = () => admin.getByRole('dialog', { name: /Team/ });

  it('admin creates an invite link bound to an email', async () => {
    await admin.getByRole('button', { name: 'Team' }).click();
    await expect.poll(() => team().locator('[data-member]').count()).toBe(1);
    const form = team().getByRole('form', { name: 'Invite' });
    await form.getByLabel('Role').selectOption('editor');
    await form.getByLabel(/Email/).fill('sam@example.com');
    await form.getByRole('button', { name: 'Create invite link' }).click();
    link = await team().getByLabel('Invite link', { exact: true }).inputValue();
    expect(link).toMatch(new RegExp(`^${stack.env.webUrl.replace(/\/$/, '')}/invite/[A-Za-z0-9_-]{20,}$`));
    await expect.poll(() => team().getByRole('region', { name: 'Pending invites' }).locator('li').allInnerTexts()).toEqual([expect.stringContaining('sam@example.com')]);
  }, 60_000);

  it('a new person opens the link, creates an account and lands in the team', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const sam = await ctx.newPage();
    await sam.goto(link);
    await sam.getByText('You are invited to').waitFor();
    expect(await sam.locator('body').innerText()).toContain('You are invited to Studio as editor.');
    const form = sam.getByRole('form', { name: 'Create your account' });
    expect(await form.getByLabel('Email').inputValue()).toBe('sam@example.com'); // bound invite: fixed email
    await form.getByLabel('Your name').fill('Sam');
    await form.getByLabel('Password').fill('password123');
    await form.getByRole('button', { name: 'Create account and join' }).click();
    await sam.getByRole('heading', { name: 'Studio · Projects' }).waitFor();
    expect(new URL(sam.url()).pathname).toBe('/');
    await sam.getByRole('button', { name: 'Poster', exact: true }).waitFor(); // an editor sees the team's projects

    // The link worked once.
    await sam.goto(link);
    await sam.getByText(/no longer valid/).waitFor();
    await ctx.close();
  }, 90_000);

  it('admin sees the new member, changes the role and revokes an unused invite', async () => {
    await team().getByRole('button', { name: 'Close' }).click();
    await admin.getByRole('button', { name: 'Team' }).click();
    await expect.poll(() => team().locator('[data-member]').count()).toBe(2);
    expect(await team().getByLabel('Role of sam@example.com').inputValue()).toBe('editor');
    await team().getByLabel('Role of sam@example.com').selectOption('viewer');
    const roleOf = async (email: string) =>
      ((await (await admin.request.get(`${stack.env.webUrl}api/teams/${teamId}/members`)).json()) as { email: string; role: string }[]).find((m) => m.email === email)?.role;
    await expect.poll(() => roleOf('sam@example.com')).toBe('viewer');

    // The last admin can't be demoted.
    await team().getByLabel('Role of ada@example.com').selectOption('viewer');
    await team().getByRole('alert').getByText('The team needs at least one admin.').waitFor();
    expect(await team().getByLabel('Role of ada@example.com').inputValue()).toBe('admin');

    // An open invite, then revoked.
    const form = team().getByRole('form', { name: 'Invite' });
    await form.getByLabel('Role').selectOption('viewer');
    await form.getByRole('button', { name: 'Create invite link' }).click();
    const unused = await team().getByLabel('Invite link', { exact: true }).inputValue();
    const pending = team().getByRole('region', { name: 'Pending invites' });
    await expect.poll(() => pending.locator('li').count()).toBe(1);
    await pending.getByRole('button', { name: /Revoke Viewer invite for anyone/ }).click();
    await expect.poll(() => team().getByRole('region', { name: 'Pending invites' }).count()).toBe(0);
    const res = await admin.request.get(`${stack.env.webUrl}api/invites/${unused.split('/').pop()}`);
    expect(res.status()).toBe(404);
  }, 90_000);

  it('the viewer can open the project but not edit; members list is read-only for them', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const sam = await ctx.newPage();
    await sam.goto(stack.env.webUrl);
    await sam.getByLabel('Email').fill('sam@example.com');
    await sam.getByLabel('Password').fill('password123');
    await sam.getByRole('button', { name: 'Sign in' }).click();
    await sam.getByRole('heading', { name: 'Studio · Projects' }).waitFor();
    expect(await sam.getByPlaceholder('New project name').count()).toBe(0); // viewers can't create
    await sam.getByRole('button', { name: 'Team' }).click();
    const dialog = sam.getByRole('dialog', { name: /Team/ });
    await expect.poll(() => dialog.locator('[data-member]').count()).toBe(2);
    expect(await dialog.getByRole('form', { name: 'Invite' }).count()).toBe(0);
    expect(await dialog.locator('select').count()).toBe(0);
    await ctx.close();
  }, 90_000);
});

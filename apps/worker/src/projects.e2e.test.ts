/**
 * T16.2 end to end: the Projects screen. A project's ⋯ menu (grouped: Open · Rename, Duplicate · Save as template,
 * Copy link · Delete), rename, save as template → a card under "Start from a template", a new project from that
 * card (the New project dialog), search and sort, delete with a confirm.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('Projects screen (T16.2)', () => {
  let stack: Stack;
  let page: Page;
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1280, height: 900 } });
    ({ teamId } = await setupAndCreateProject(page, stack.env.webUrl, 'Spring'));
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const list = () => page.getByRole('list', { name: 'Projects' });
  const names = () => list().locator('.sc-rows__name').allInnerTexts();
  const menuFor = async (name: string) => {
    await page.getByRole('button', { name: `More actions for ${name}` }).click();
    const menu = page.getByRole('menu', { name });
    await menu.waitFor();
    return menu;
  };
  const dialog = () => page.getByRole('dialog');

  it('a project’s ⋯ menu groups its actions; rename goes through a dialog', async () => {
    const menu = await menuFor('Spring');
    expect(await menu.getByRole('menuitem').allInnerTexts()).toEqual(['Open', 'Open in new tab', 'Rename…', 'Duplicate…', 'Save as template…', 'Copy link', 'Delete…']);
    // Arrow keys move between the items.
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Open in new tab');
    await menu.getByRole('menuitem', { name: 'Rename…' }).click();
    await dialog().getByLabel('Name').fill('Summer');
    await dialog().getByRole('button', { name: 'Rename' }).click();
    await expect.poll(names).toEqual(['Summer']);
    const rows = (await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/projects`)).json()) as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Summer']);
  }, 60_000);

  it('save as template → a card on top; the card starts a new project from it', async () => {
    await (await menuFor('Summer')).getByRole('menuitem', { name: 'Save as template…' }).click();
    expect(await dialog().getByLabel('Template name').inputValue()).toBe('Summer template');
    await dialog().getByRole('button', { name: 'Save template' }).click();
    const cards = page.getByRole('list', { name: 'Templates' });
    await cards.getByRole('button', { name: 'New project from Summer template' }).click();
    const create = page.getByRole('dialog', { name: 'New project' });
    expect(await create.getByPlaceholder('New project name').inputValue()).toBe('Summer');
    expect(await create.getByRole('radio', { name: 'Summer template' }).isChecked()).toBe(true);
    await create.getByPlaceholder('New project name').fill('Autumn');
    await create.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.sc-comp-group').waitFor();
    await page.goto(stack.env.webUrl);
    await expect.poll(names).toEqual(['Autumn', 'Summer']);
    // The template's menu: use / edit, rename, duplicate, copy link, delete.
    await page.keyboard.press('Escape');
    expect(await (await menuFor('Summer template')).getByRole('menuitem').allInnerTexts()).toEqual(['Use template', 'Edit template', 'Rename…', 'Duplicate…', 'Copy link', 'Delete template…']);
    await page.keyboard.press('Escape');
  }, 60_000);

  it('search and sort the list; no match says so and clears', async () => {
    await page.getByLabel('Search projects').fill('sum');
    await expect.poll(names).toEqual(['Summer']);
    await page.getByLabel('Search projects').fill('zzz');
    await page.getByText('No projects match “zzz”.').waitFor();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByLabel('Sort projects').selectOption('name');
    await expect.poll(names).toEqual(['Autumn', 'Summer']);
  }, 30_000);

  it('delete asks first (in the app’s own dialog), then removes the project', async () => {
    await (await menuFor('Autumn')).getByRole('menuitem', { name: 'Delete…' }).click();
    await dialog().getByText('“Autumn” and everything in it will be deleted for the whole team.').waitFor();
    await dialog().getByRole('button', { name: 'Cancel' }).click();
    expect(await names()).toContain('Autumn');
    await (await menuFor('Autumn')).getByRole('menuitem', { name: 'Delete…' }).click();
    await dialog().getByRole('button', { name: 'Delete project' }).click();
    await expect.poll(names).toEqual(['Summer']);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/projects.png` });
  }, 30_000);
});

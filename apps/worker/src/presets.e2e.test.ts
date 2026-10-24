/**
 * M4 end to end: the Size presets dialog lists every Preset node family with its sizes; an admin renames or
 * deletes a team family as a whole (a built-in family's name is refused), through the app's own dialogs.
 * Q2: a Preset node made from a team family offers the family's new name and the sizes it gained.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addPresetSet, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('preset families in the Size presets dialog (M4)', () => {
  let stack: Stack;
  let page: Page;
  let ids = { teamId: '', projectId: '' };
  let boardUrl = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1280, height: 900 } });
    ids = await setupAndCreateProject(page, stack.env.webUrl, 'Presets');
    boardUrl = page.url();
    await page.goto(stack.env.webUrl);
    await page.getByRole('button', { name: 'Size presets' }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const dialog = () => page.getByRole('dialog', { name: 'Size presets' });
  const families = () => dialog().getByRole('region', { name: 'Preset node families' });
  const ask = () => page.locator('dialog:has(> .sc-ask)');
  const add = async (name: string, family: string, w: string, h: string) => {
    const form = dialog().getByRole('form', { name: 'New preset' });
    await form.getByLabel('Name').fill(name);
    await form.getByLabel('Preset node family').fill(family);
    await form.getByLabel('Width').fill(w);
    await form.getByLabel('Height').fill(h);
    await form.getByRole('button', { name: 'Add preset' }).click();
    await dialog().locator(`li[data-preset="${name}"]`).waitFor();
  };

  it('every family is listed with its sizes; built-ins are marked and fixed', async () => {
    const gdn = families().locator('li[data-family="GDN"]');
    await gdn.getByText('7 sizes').waitFor();
    expect(await gdn.getByText('Built-in').count()).toBe(1);
    expect(await gdn.getByRole('button', { name: /Rename|Delete/ }).count()).toBe(0);
    await gdn.locator('summary').click();
    expect(await gdn.getByRole('list', { name: 'GDN sizes' }).getByRole('listitem').count()).toBe(7);
  }, 30_000);

  it('a team family: its sizes show; rename refuses a built-in name, then renames every size', async () => {
    await add('Shop banner', 'Shop', '728', '90');
    await add('Shop square', 'Shop', '300', '250');
    const shop = families().locator('li[data-family="Shop"]');
    await shop.getByText('2 sizes').waitFor();
    await shop.locator('summary').click();
    expect(await shop.getByRole('list', { name: 'Shop sizes' }).innerText()).toContain('728 × 90 px');

    await dialog().getByRole('button', { name: 'Rename family Shop' }).click();
    await ask().getByLabel('Family name').fill('GDN');
    await ask().getByRole('button', { name: 'Rename' }).click();
    await dialog().getByRole('alert').getByText('That is a built-in family’s name; pick another.').waitFor();

    await dialog().getByRole('button', { name: 'Rename family Shop' }).click();
    await ask().getByLabel('Family name').fill('Store');
    await ask().getByRole('button', { name: 'Rename' }).click();
    await families().locator('li[data-family="Store"]').getByText('2 sizes').waitFor();
    expect(await families().locator('li[data-family="Shop"]').count()).toBe(0);
    expect(await dialog().locator('li[data-preset="Shop banner"]').innerText()).toContain('Store family');
  }, 60_000);

  it('delete asks first, then removes the family and its sizes', async () => {
    await dialog().getByRole('button', { name: 'Delete family Store' }).click();
    await ask().getByText('Its 2 sizes will be deleted for the whole team.', { exact: false }).waitFor();
    await ask().getByRole('button', { name: 'Cancel' }).click();
    expect(await families().locator('li[data-family="Store"]').count()).toBe(1);
    await dialog().getByRole('button', { name: 'Delete family Store' }).click();
    await ask().getByRole('button', { name: 'Delete family' }).click();
    await expect.poll(() => families().locator('li[data-family="Store"]').count()).toBe(0);
    expect(await dialog().locator('li[data-preset="Shop banner"]').count()).toBe(0);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/preset-families.png` });
  }, 30_000);

  it('Q2: a Preset node made from a team family offers the family’s new name and the sizes it gained', async () => {
    const api = `${stack.env.webUrl}api/teams/${ids.teamId}`;
    const preset = async (name: string, family: string, width: number, height: number) => {
      const res = await page.request.post(`${api}/presets`, { data: { group: 'social', name, family, size: { width, height, unit: 'px' } } });
      expect(res.status()).toBe(201);
      return (await res.json()) as { id: string; name: string; size: { width: number; height: number; unit: 'px' } };
    };
    const a = await preset('Kiosk tall', 'Kiosk', 1080, 1920);
    const b = await preset('Kiosk wide', 'Kiosk', 1920, 1080);
    // The Preset node, as the canvas menu makes it from the family (each size keeps its preset).
    const projectUrl = `${api}/projects/${ids.projectId}`;
    const cur = (await (await page.request.get(projectUrl)).json()) as { rev: number; doc: ProjectDoc };
    const made = addPresetSet(cur.doc, { id: 'kiosk', label: 'Kiosk', board: { x: 1400, y: 900 }, sizes: [a, b].map((p) => ({ id: `o-${p.id}`, label: p.name, presetId: p.id, size: p.size })) });
    if (!made.ok) throw new Error(made.error);
    expect((await page.request.put(projectUrl, { data: { rev: cur.rev, doc: made.doc } })).status()).toBe(200);
    // The family is renamed and gains a size.
    expect((await page.request.put(`${api}/preset-families/Kiosk`, { data: { name: 'Kiosk Wall' } })).status()).toBe(200);
    await preset('Kiosk square', 'Kiosk Wall', 1080, 1080);
    await page.goto(boardUrl);
    const node = page.locator('.react-flow__node[data-id="set:kiosk"]');
    const offers = node.getByRole('group', { name: 'Team family Kiosk Wall' });
    await offers.waitFor({ timeout: 20_000 });
    await offers.getByRole('button', { name: 'Rename to “Kiosk Wall”' }).dispatchEvent('click');
    await offers.getByRole('button', { name: 'Add 1 new size' }).dispatchEvent('click');
    const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(projectUrl)).json()).doc;
    await expect.poll(async () => { const set = (await doc()).presetSets?.find((x) => x.id === 'kiosk'); return [set?.label, set?.outputs.length]; }, { timeout: 15_000 }).toEqual(['Kiosk Wall', 3]);
    expect((await doc()).outputs.some((o) => o.label === 'Kiosk square' && o.size.width === 1080 && o.size.height === 1080)).toBe(true);
    await offers.waitFor({ state: 'detached' }); // nothing left to offer
  }, 60_000);
});

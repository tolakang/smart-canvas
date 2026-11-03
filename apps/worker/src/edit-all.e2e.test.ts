/**
 * D83 (owner, 2026-11-03: "add 'Edit all' button that user can see all export sizes and edit those at once? Manual
 * edit one by one still available too"): Edit all on a Preset node opens the editor on its first size with every size
 * of the node live along the stage; a click edits another. Each Preview's own Edit stays.
 * D84: with All sizes on, an edit to a layer applies to it in every size of the node, in proportion, as one step.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from './test/stack';

const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>');

describe.skipIf(!adminUrl)('Edit all (D83)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

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
    await dialog.getByPlaceholder('New project name').fill('Edit all');
    await dialog.getByRole('button', { name: /^GDN sizes/ }).click();
    await dialog.locator('input[type=file]').setInputFiles([{ name: 'brand.svg', mimeType: 'image/svg+xml', buffer: logoSvg }]);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.locator('.react-flow__node-presetNode').first().waitFor();
    const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const preset = () => page.locator('.react-flow__node-presetNode').first();

  it('Edit all opens the first size with every size of the node a click away; editing one changes that one only', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await preset().getByRole('button', { name: 'Edit all GDN sizes' }).dispatchEvent('click');
    const strip = page.getByRole('group', { name: 'Sizes of GDN' });
    await strip.waitFor();
    const d = await doc();
    const ids = d.presetSets?.[0]?.outputs ?? [];
    expect(await strip.getByRole('button').count()).toBe(ids.length);
    const first = d.outputs.find((o) => o.id === ids[0]);
    const second = d.outputs.find((o) => o.id === ids[1]);
    if (!first || !second) throw new Error('no sizes');
    await page.getByRole('dialog', { name: `Preview editor ${first.label}` }).waitFor();
    expect(await strip.locator('[aria-current="true"]').count()).toBe(1);
    // Another size: the same editor now edits it.
    await strip.getByRole('button', { name: `Edit ${second.label}` }).click();
    const editor = page.getByRole('dialog', { name: `Preview editor ${second.label}` });
    await editor.waitFor();
    await editor.getByRole('complementary', { name: 'Layers' }).getByRole('button', { name: /^brand/ }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await doc()).outputs.find((o) => o.id === second.id)?.overrides.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    expect((await doc()).outputs.find((o) => o.id === first.id)?.overrides.length ?? 0).toBe(0);
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
  }, 90_000);

  it('a Preview’s own Edit still opens that size alone, with no strip of sizes', async () => {
    const d = await doc();
    const o = d.outputs.find((x) => x.id === d.presetSets?.[0]?.outputs[0]);
    if (!o) throw new Error('no size');
    await page.getByRole('button', { name: `Edit Preview ${o.label}` }).first().dispatchEvent('click');
    await page.getByRole('dialog', { name: `Preview editor ${o.label}` }).waitFor();
    expect(await page.getByRole('group', { name: 'Sizes of GDN' }).count()).toBe(0);
  }, 60_000);

  it('D84: All sizes — a nudge moves the layer in every size, in proportion; the eye hides it in all; one undo takes it back', async () => {
    const d = await doc();
    const ids = d.presetSets?.[0]?.outputs ?? [];
    const brand = d.sources.find((x) => x.label === 'brand');
    if (!brand) throw new Error('no logo');
    // Start clean: no edits on any size.
    await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
    await preset().getByRole('button', { name: 'Edit all GDN sizes' }).dispatchEvent('click');
    const strip = page.getByRole('group', { name: 'Sizes of GDN' });
    await strip.waitFor();
    const scope = page.getByRole('group', { name: 'Edits apply to' });
    await scope.getByRole('button', { name: /^All \d+ sizes$/ }).click();
    const layers = page.getByRole('complementary', { name: 'Layers' });
    await layers.getByRole('button', { name: /^brand/ }).click();
    const edited = async () => (await doc()).outputs.filter((o) => ids.includes(o.id) && o.overrides.some((x) => x.sourceId === brand.id && x.frame)).length;
    const before = await edited();
    for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(edited, { timeout: 15_000 }).toBe(ids.length);
    expect(before).toBeLessThan(ids.length);
    // Hide it in every size from the layer's eye.
    await layers.getByRole('button', { name: /^Hide layer brand/ }).click();
    await expect.poll(async () => (await doc()).outputs.filter((o) => ids.includes(o.id) && o.overrides.some((x) => x.sourceId === brand.id && x.hidden)).length, { timeout: 15_000 }).toBe(ids.length);
    // One undo shows it again in all of them.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await doc()).outputs.filter((o) => ids.includes(o.id) && o.overrides.some((x) => x.sourceId === brand.id && x.hidden)).length, { timeout: 15_000 }).toBe(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }, 90_000);
});

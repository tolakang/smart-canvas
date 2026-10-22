/**
 * T8.1 end to end: the main node's layer list and the editor's Layers panel re-order by drag & drop and have
 * only show/hide, duplicate (+) and delete; no ▲ ▼. Duplicate of a wired layer is wired at the same spot.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { mainComposition, portOf, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('layer list (T8.1)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Layers');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const main = () => page.locator('.react-flow__node-mainNode');
  const row = (label: string) => main().locator('.sc-port', { has: page.locator('.sc-port__label', { hasText: new RegExp(`^${label}$`) }) });
  const order = async () => main().locator('.sc-port__label').allInnerTexts();
  const portsOf = (d: ProjectDoc) => Object.fromEntries(d.sources.map((s) => [s.label, portOf(d, s.id)]));

  it('shows grip, thumbnail, wired dot, eye, + and trash; no arrows', async () => {
    expect(await order()).toEqual(['Logo', 'Headline', 'Subject', 'Background']);
    expect(await main().getByRole('button', { name: /^Move / }).count()).toBe(0);
    expect(await main().locator('.sc-port__grip').count()).toBe(4);
    expect(await main().locator('.sc-layer-thumb').count()).toBe(4);
    for (const l of ['Background', 'Subject', 'Headline', 'Logo']) await main().getByRole('button', { name: `Connect ${l}`, exact: true }).click();
    await saved();
    expect(await main().getByRole('button', { name: /^Disconnect / }).count()).toBe(4);
    for (const name of ['Hide layer Logo', 'Duplicate Logo', 'Delete Logo']) expect(await row('Logo').getByRole('button', { name, exact: true }).count()).toBe(1);
  }, 60_000);

  it('re-orders by dragging a row onto another — within its layer comp group (D45)', async () => {
    // Across groups: the background dropped on the logo goes back under the elements.
    await row('Background').dragTo(row('Logo'));
    await page.waitForTimeout(400);
    await saved();
    expect(await order()).toEqual(['Logo', 'Headline', 'Subject', 'Background']);
    // Within a group: two elements swap.
    await row('Subject').getByRole('button', { name: 'Duplicate Subject' }).click();
    await expect.poll(order).toEqual(['Logo', 'Headline', 'Subject copy', 'Subject', 'Background']);
    await row('Subject').dragTo(row('Subject copy'));
    await expect.poll(order).toEqual(['Logo', 'Headline', 'Subject', 'Subject copy', 'Background']);
    await saved();
    const d = await doc();
    expect(portsOf(d)).toMatchObject({ Subject: 2, 'Subject copy': 3 });
    expect(d.edges.some((e) => e.from === 'subject' && e.to === 'main')).toBe(true); // its wire moved with it
    page.once('dialog', (dl) => void dl.accept());
    await row('Subject copy').getByRole('button', { name: 'Delete Subject copy' }).click();
    await expect.poll(order).toEqual(['Logo', 'Headline', 'Subject', 'Background']);
    await saved();
  }, 60_000);

  it('+ duplicates a wired layer: wired, in front of the original, at the same spot', async () => {
    await row('Logo').getByRole('button', { name: 'Duplicate Logo' }).click();
    await expect.poll(order).toEqual(['Logo copy', 'Logo', 'Headline', 'Subject', 'Background']);
    await saved();
    const d = await doc();
    const copy = d.sources.find((s) => s.label === 'Logo copy');
    expect(d.edges.some((e) => e.from === copy?.id && e.to === 'main')).toBe(true);
    expect(mainComposition(d).placements[copy?.id ?? '']).toEqual(mainComposition(d).placements.logo);
    expect(await page.locator('.react-flow__node-inputNode', { hasText: 'Logo copy' }).count()).toBe(1);
  }, 60_000);

  it('the eye hides; trash deletes after a confirm', async () => {
    await row('Headline').getByRole('button', { name: 'Hide layer Headline' }).click();
    await saved();
    expect((await doc()).sources.find((s) => s.id === 'headline')?.visible).toBe(false);
    await row('Headline').getByRole('button', { name: 'Show layer Headline' }).click();

    page.once('dialog', (d) => void d.accept());
    await row('Logo copy').getByRole('button', { name: 'Delete Logo copy' }).click();
    await expect.poll(order).toEqual(['Logo', 'Headline', 'Subject', 'Background']);
    await saved();
    expect((await doc()).sources).toHaveLength(4);
  }, 60_000);

  it('the editor Layers panel re-orders by drag too, with the same actions', async () => {
    await main().getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('complementary', { name: 'Layers' });
    const layer = (id: string) => panel.locator(`[data-layer="${id}"]`);
    expect(await panel.getByRole('button', { name: /^(Bring|Send) / }).count()).toBe(0);
    // A drag out of the layer's group (D45) leaves it where it was.
    await layer('subject').dragTo(layer('logo'));
    await page.waitForTimeout(400);
    expect(await panel.locator('[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')))).toEqual(['logo', 'headline', 'subject', 'background']);
    expect(await layer('logo').getByRole('button', { name: 'Duplicate Logo' }).count()).toBe(1);
    await page.keyboard.press('Escape');
    await saved();
    expect(portsOf(await doc())).toMatchObject({ Logo: 0, Subject: 2 });
  }, 60_000);
});

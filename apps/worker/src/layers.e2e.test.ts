/**
 * T8.1 / D48 / D49 end to end: the Layer Comp lists the layer order as its four groups — logo, headline,
 * elements, background — re-ordered by drag (or ↑ ↓), and every layout follows. The editor's Layers panel
 * re-orders layers by drag within their group, with show/hide, duplicate and delete; no ▲ ▼.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { layerOrderOf, mainComposition, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLayout, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('layer order (T8.1, D48)', () => {
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
  const comp = () => page.locator('.react-flow__node-mainNode');
  const groups = () => comp().getByRole('list', { name: 'Layer order (front first)' }).locator('.sc-comp__group-name').allInnerTexts();
  const group = (name: string) => comp().locator('.sc-comp__group', { has: page.locator('.sc-comp__group-name', { hasText: new RegExp(`^${name}$`) }) });

  it('the Layer Comp shows the four groups, logo on top', async () => {
    expect(await groups()).toEqual(['Logo', 'Headline', 'Elements', 'Background']);
    // Each group counts its layers (the default board: one logo, the headline text and its two pictures, the subject, the background).
    expect(await group('Elements').locator('.sc-comp__count').innerText()).toBe('1');
  }, 30_000);

  it('dragging a group re-orders every composition’s rows; ↑ ↓ too', async () => {
    await group('Elements').dragTo(group('Logo'));
    await expect.poll(groups).toEqual(['Elements', 'Logo', 'Headline', 'Background']);
    await saved();
    let d = await doc();
    expect(layerOrderOf(d)).toEqual(['elements', 'logo', 'headline', 'background']);
    expect(mainComposition(d).layers[0]).toBe('subject');
    // Back with the arrows: the default order is not stored.
    // (The arrows show on hover; clicked without a pointer, as the row moves under it.)
    for (let i = 0; i < 2; i++) {
      await group('Elements').locator('button[aria-label="Move Elements down"]').dispatchEvent('click');
      await page.waitForTimeout(200);
    }
    await expect.poll(groups).toEqual(['Logo', 'Headline', 'Elements', 'Background']);
    await saved();
    d = await doc();
    expect(d.layerOrder).toBeUndefined();
    expect(mainComposition(d).layers[0]).toBe('logo');
  }, 60_000);

  it('the editor Layers panel re-orders by drag, never out of a layer’s group, with the same actions', async () => {
    await openLayout(page);
    const panel = page.getByRole('complementary', { name: 'Layers' });
    const layer = (id: string) => panel.locator(`[data-layer="${id}"]`);
    expect(await panel.getByRole('button', { name: /^(Bring|Send) / }).count()).toBe(0);
    const before = await panel.locator('[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')));
    // A drag out of the layer's group (D45) leaves it where it was.
    await layer('subject').dragTo(layer('logo'));
    await page.waitForTimeout(400);
    expect(await panel.locator('[data-layer]').evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')))).toEqual(before);
    expect(await layer('logo').getByRole('button', { name: 'Duplicate Logo' }).count()).toBe(1);
    await page.keyboard.press('Escape');
    await saved();
    const layers = mainComposition(await doc()).layers;
    expect(layers.indexOf('logo')).toBe(0);
    expect(layers.indexOf('subject')).toBeGreaterThan(layers.indexOf('headline'));
  }, 60_000);

  it('UX B5 (F13): a headline pair is one row — the language in use — with a KM / EN switch; empty layers say so', async () => {
    await openLayout(page);
    const panel = page.getByRole('complementary', { name: 'Layers' });
    const pair = (await doc()).headlines?.[0];
    expect(pair).toBeDefined();
    if (!pair) return;
    expect(pair.use).toBe('km');
    expect(await panel.locator(`[data-layer="${pair.km}"]`).count()).toBe(1);
    expect(await panel.locator(`[data-layer="${pair.en}"]`).count()).toBe(0);
    const lang = panel.getByRole('group', { name: `${pair.label} language` });
    expect(await lang.getByRole('button', { name: 'KM' }).getAttribute('aria-pressed')).toBe('true');
    await lang.getByRole('button', { name: 'EN' }).click();
    await saved();
    expect((await doc()).headlines?.[0]?.use).toBe('en');
    await panel.locator(`[data-layer="${pair.en}"]`).waitFor();
    expect(await panel.locator(`[data-layer="${pair.km}"]`).count()).toBe(0);
    // A new project's empty picture slot is listed in its place, marked empty.
    expect(await panel.locator('[data-layer="subject"]').innerText()).toContain('empty');
    await page.keyboard.press('Escape');
  }, 60_000);
});

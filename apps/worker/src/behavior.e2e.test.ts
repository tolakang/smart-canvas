/**
 * T8.7 end to end: a background colour added from the canvas menu fills every output (it used to be added as a
 * decoration, which keeps its master size: a strip in a 9:16 story); and an input's behaviour can be changed
 * on its node, re-flowing the outputs.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('input behaviours (T8.7)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Behaviour');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const story = () => page.getByLabel('Output Story', { exact: true });

  /** The layer's box inside the output thumbnail, as fractions of the thumbnail. */
  const coverage = (id: string) =>
    story()
      .locator('.sc-render')
      .first()
      .evaluate((render, sourceId) => {
        const r = render.getBoundingClientRect();
        const el = render.querySelector(`[data-source-id="${sourceId}"]`);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { w: b.width / r.width, h: b.height / r.height };
      }, id);

  it('"Background colour / gradient" from the canvas menu fills a 9:16 story', async () => {
    // A story output, and the default inputs out of the way.
    await page.getByRole('button', { name: '+ Add output' }).click();
    await page.getByRole('dialog').getByLabel('Preset').selectOption({ label: 'Story / Reel / TikTok 9:16 · 1080×1920 px' });
    await page.getByRole('dialog').getByLabel('Name').fill('Story');
    await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();

    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no canvas');
    const spot = await page.evaluate(() => {
      const p = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!p) return null;
      for (let y = p.bottom - 300; y > p.top; y -= 40)
        for (let x = p.right - 320; x > p.left; x -= 40) if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      return null;
    });
    if (!spot) throw new Error('no empty spot');
    await page.mouse.click(spot.x, spot.y, { button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Background colour / gradient' }).click();
    await saved();
    const added = (await doc()).sources.find((s) => s.kind === 'fill' && s.id !== 'background');
    expect(added).toMatchObject({ behavesLike: 'background' });
    await page.locator(`.react-flow__node-mainNode .sc-port[data-port="${added?.port}"] .sc-port__dot`).click();
    await saved();
    await expect.poll(() => coverage(added?.id ?? '')).toEqual({ w: 1, h: 1 });
  }, 90_000);

  it('changing "behaves like" on the node re-flows the outputs', async () => {
    const id = (await doc()).sources.find((s) => s.kind === 'fill' && s.id !== 'background')?.id ?? '';
    const label = (await doc()).sources.find((s) => s.id === id)?.label ?? '';
    const picker = page.locator(`.react-flow__node[data-id="src:${id}"]`).getByLabel(`${label} behaves like`);
    expect(await picker.locator('option').allInnerTexts()).toEqual(['Background', 'Decoration']);
    await picker.selectOption('decoration');
    await saved();
    expect((await doc()).sources.find((s) => s.id === id)?.behavesLike).toBe('decoration');
    // As a decoration it keeps its master size: no longer the full story.
    await expect.poll(async () => (await coverage(id))?.h ?? 1).toBeLessThan(0.9);
    await picker.selectOption('background');
    await expect.poll(() => coverage(id)).toEqual({ w: 1, h: 1 });
  }, 60_000);
});

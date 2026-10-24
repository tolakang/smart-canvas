/**
 * T8.7 end to end: a background colour added from the canvas menu fills every output (it used to be added as a
 * decoration, which keeps its master size: a strip in a 9:16 story); and an input's behaviour can be changed
 * on its node, re-flowing the outputs.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc } from '@smart-canvas/core';
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
  const story = () => page.getByLabel('Preview Story', { exact: true });

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

  it('the Background node (a colour by default) fills a 9:16 story', async () => {
    // A story output (D49: it joins a Sizes preset node on the board).
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const r = addOutput(cur.doc, { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' } });
    if (!r.ok) throw new Error(r.error);
    expect((await page.request.put(url, { data: { rev: cur.rev, doc: r.doc } })).status()).toBe(200);
    await page.reload();
    await story().waitFor();
    await expect.poll(() => coverage('background')).toEqual({ w: 1, h: 1 });
  }, 90_000);

  it('changing "behaves like" (inspector) re-flows the outputs', async () => {
    const id = 'background';
    const label = (await doc()).sources.find((s) => s.id === id)?.label ?? '';
    await page.getByRole('button', { name: 'Fit to screen (Shift+1)' }).click(); // nodes added since the first fit
    await page.waitForTimeout(300);
    await page.locator(`.react-flow__node[data-id="src:${id}"] .sc-node__title`).dispatchEvent('click');
    const picker = page.getByRole('complementary', { name: 'Inspector' }).getByLabel(`${label} behaves like`);
    expect(await picker.locator('option').allInnerTexts()).toEqual(['Background', 'Decoration']);
    await picker.selectOption('decoration');
    await saved();
    expect((await doc()).sources.find((s) => s.id === id)?.behavesLike).toBe('decoration');
    // As a decoration filling the (square) master it covers the story but keeps its shape (D38): 1920×1920, wider than the story.
    await expect.poll(async () => (await coverage(id))?.w ?? 1).toBeGreaterThan(1.7);
    expect((await coverage(id))?.h).toBeCloseTo(1, 2);
    await picker.selectOption('background');
    await expect.poll(() => coverage(id)).toEqual({ w: 1, h: 1 });
  }, 60_000);
});

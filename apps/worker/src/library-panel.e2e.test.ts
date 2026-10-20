/**
 * T13.4 end to end: the left node library. Click an item to add it in the middle of the view; drag one onto
 * the canvas to place it at the drop point; search filters; the panel collapses to a rail and stays so.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('node library panel (T13.4)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1700, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Library');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const panel = () => page.getByRole('complementary', { name: 'Node library' });
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('click adds an input; search filters the list', async () => {
    const before = (await doc()).sources.length;
    await panel().getByRole('button', { name: /^Text(?! variant)/ }).click();
    await saved();
    expect((await doc()).sources.length).toBe(before + 1);
    expect((await doc()).sources.at(-1)).toMatchObject({ kind: 'text', behavesLike: 'text' });
    await panel().getByLabel('Search nodes').fill('square');
    expect(await panel().getByRole('button', { name: /^Instagram square/ }).count()).toBe(1);
    expect(await panel().getByRole('button', { name: /^Text(?! variant)/ }).count()).toBe(0);
  }, 60_000);

  it('drag a preset onto the canvas: an output of that size, placed at the drop point', async () => {
    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    const target = { x: pane.width - 250, y: pane.height - 200 };
    await panel().getByRole('button', { name: /^Instagram square/ }).dragTo(page.locator('.react-flow__pane'), { targetPosition: target });
    await expect.poll(async () => (await doc()).outputs.length).toBe(1);
    const out = (await doc()).outputs[0];
    expect(out).toMatchObject({ label: 'Instagram square', size: { width: 1080, height: 1080, unit: 'px' } });
    const node = await page.locator(`.react-flow__node-outputNode[data-id="out:${out?.id}"]`).boundingBox();
    expect(Math.abs((node?.x ?? 0) - (pane.x + target.x))).toBeLessThan(5);
    expect(Math.abs((node?.y ?? 0) - (pane.y + target.y))).toBeLessThan(5);
    expect(out && (await doc()).edges.some((e) => e.kind === 'composition' && e.to === out.id)).toBe(true); // wired to main
  }, 60_000);

  it('collapses to a rail, remembered across a reload', async () => {
    await panel().getByRole('button', { name: 'Hide node library' }).click();
    await panel().getByRole('button', { name: 'Show node library' }).waitFor();
    await page.reload();
    await panel().getByRole('button', { name: 'Show node library' }).click();
    await panel().getByLabel('Search nodes').waitFor();
  }, 60_000);
});

/**
 * T10.2 end to end: board design pass. An output still named after its size follows a preset / size change
 * (it used to keep the old "1080×1350 px" name); double-click renames it; hand edits show as a chip.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('board look (T10.2)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Look');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const doc = ok(addOutput(p.doc, { id: 'o1', label: '1080×1350 px', size: { width: 1080, height: 1350, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const node = () => page.locator('.react-flow__node-outputNode[data-id="out:o1"]');
  const title = () => node().locator('.sc-node__title');
  /** T13.2: the output's settings, in the inspector once its node is selected. */
  const settings = async () => {
    await title().click();
    return page.getByRole('complementary', { name: 'Inspector' });
  };
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('a size-named output follows a new size', async () => {
    await expect.poll(() => title().innerText()).toBe('1080×1350 px');
    const panel = await settings();
    await panel.getByLabel('Width').fill('1200');
    await panel.getByLabel('Width').press('Enter');
    await panel.getByLabel('Height').fill('630');
    await panel.getByLabel('Height').press('Enter');
    await expect.poll(() => title().innerText()).toBe('1200×630 px');
    await saved();
  }, 30_000);

  it('double-click renames; a typed name then stays when the size changes', async () => {
    await title().dblclick();
    await node().getByLabel('Output name').fill('Facebook ad');
    await node().getByLabel('Output name').press('Enter');
    await expect.poll(() => title().innerText()).toBe('Facebook ad');
    const panel = await settings();
    await panel.getByLabel('Width').fill('1080');
    await panel.getByLabel('Width').press('Enter');
    await saved();
    expect(await title().innerText()).toBe('Facebook ad');
    expect((await (await page.request.get(url)).json()).doc.outputs.find((o: { id: string }) => o.id === 'o1')?.label).toBe('Facebook ad');
  }, 30_000);

  it('the card stays small: its settings are in the inspector (T13.2)', async () => {
    expect(await node().getByLabel('Preset').count()).toBe(0);
    const panel = await settings();
    expect(await panel.getByLabel('Output name').inputValue()).toBe('Facebook ad');
    expect(await panel.getByLabel('Preset').count()).toBe(1);
    if (process.env.T102_SHOT) await page.screenshot({ path: process.env.T102_SHOT });
    // Clicking the empty canvas clears the selection.
    const spot = await page.evaluate(() => {
      const p = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!p) return null;
      for (let y = p.top + 40; y < p.bottom - 40; y += 30)
        for (let x = p.left + 40; x < p.right - 40; x += 30) if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      return null;
    });
    if (!spot) throw new Error('no empty spot');
    await page.mouse.click(spot.x, spot.y);
    await panel.getByText('Nothing selected').waitFor();
  }, 30_000);

  it('an input selected in the inspector: rename and edit its content there (T13.2)', async () => {
    const headline = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Headline$/ }) });
    await headline.locator('.sc-node__title').click();
    const panel = page.getByRole('complementary', { name: 'Inspector' });
    await panel.getByLabel('Headline text').fill('From the inspector');
    await panel.getByLabel('Input name').fill('Title');
    await panel.getByLabel('Input name').press('Enter');
    await saved();
    const d = (await (await page.request.get(url)).json()).doc as { sources: { id: string; label: string; content: { text?: string } }[] };
    expect(d.sources.find((s) => s.id === 'headline')).toMatchObject({ label: 'Title', content: { text: 'From the inspector' } });
  }, 30_000);
});

/**
 * T10.2 end to end: board design pass. An output still named after its size follows a preset / size change
 * (it used to keep the old "1080×1350 px" name); double-click renames it; hand edits show as a chip.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

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
    await page.locator('.react-flow__node-outputNode[data-id="out:o1"]').waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const node = () => page.locator('.react-flow__node-outputNode[data-id="out:o1"]');
  /** D49: a Preview's header names its size; the output's name is its title attribute. */
  const name = () => node().locator('.sc-preview__size');
  const title = { innerText: () => name().getAttribute('title') };
  /** T13.2: the output's settings, in the inspector once its node is selected. */
  const settings = async () => {
    await node().locator('.sc-node__title').click();
    return page.getByRole('complementary', { name: 'Inspector' });
  };
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('a size-named output follows a new size', async () => {
    await expect.poll(() => title.innerText()).toBe('1080×1350 px');
    const panel = await settings();
    await panel.getByLabel('Width').fill('1200');
    await panel.getByLabel('Width').press('Enter');
    await panel.getByLabel('Height').fill('630');
    await panel.getByLabel('Height').press('Enter');
    await expect.poll(() => title.innerText()).toBe('1200×630 px');
    await saved();
  }, 30_000);

  it('renamed in the inspector; a typed name then stays when the size changes', async () => {
    const panel = await settings();
    await panel.getByLabel('Preview name').fill('Facebook ad');
    await panel.getByLabel('Preview name').press('Enter');
    await expect.poll(() => title.innerText()).toBe('Facebook ad');
    await panel.getByLabel('Width').fill('1080');
    await panel.getByLabel('Width').press('Enter');
    await saved();
    expect(await title.innerText()).toBe('Facebook ad');
    expect((await (await page.request.get(url)).json()).doc.outputs.find((o: { id: string }) => o.id === 'o1')?.label).toBe('Facebook ad');
  }, 30_000);

  it('the card stays small: its settings are in the inspector (T13.2)', async () => {
    expect(await node().getByLabel('Preset').count()).toBe(0);
    const panel = await settings();
    expect(await panel.getByLabel('Preview name').inputValue()).toBe('Facebook ad');
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
    // D49: a text slot of the Text node, focused on the card, is set in the inspector.
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await boardNode(page, 'Text').locator('.sc-node__title').click();
    await boardNode(page, 'Text').getByLabel('Headline text').focus();
    const panel = page.getByRole('complementary', { name: 'Inspector' });
    await panel.getByLabel('Headline text').fill('From the inspector');
    await panel.getByLabel('Input name').fill('Title');
    await panel.getByLabel('Input name').press('Enter');
    await saved();
    const d = (await (await page.request.get(url)).json()).doc as { sources: { id: string; label: string; content: { text?: string } }[] };
    expect(d.sources.find((s) => s.id === 'headline')).toMatchObject({ label: 'Title', content: { text: 'From the inspector' } });
  }, 30_000);

  it('N1: the inspector names the page-3 nodes — Layer Comp with its three layouts (no "Layout guides"), Text node, Preview', async () => {
    const panel = page.getByRole('complementary', { name: 'Inspector' });
    await page.locator('.sc-node--main .sc-node__title').click();
    await panel.getByText('Main Comps', { exact: true }).waitFor();
    for (const f of ['Square', 'Vertical', 'Horizontal']) expect(await panel.getByRole('button', { name: `Edit ${f} layout` }).count()).toBe(1);
    expect(await panel.getByText('Layout guides').count()).toBe(0);
    expect(await panel.getByText('Master preview').count()).toBe(0);
    await boardNode(page, 'Text').locator('.sc-node__title').click();
    await panel.getByText('Text node', { exact: true }).waitFor();
    await node().locator('.sc-node__title').click();
    await panel.getByText('Preview', { exact: true }).waitFor();
  }, 30_000);

  it('dark theme toggle (T13.3, D34): switches the tokens, is remembered, and leaves the artwork alone', async () => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await theme()).toBe('light'); // headless Chromium reports a light system theme
    const lightCard = await bg('.react-flow__node-outputNode .sc-node');
    await page.getByRole('button', { name: 'Dark theme' }).click();
    expect(await theme()).toBe('dark');
    expect(await page.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
    expect(await bg('.react-flow__node-outputNode .sc-node')).not.toBe(lightCard);
    await page.reload();
    await page.locator('.react-flow__node-outputNode').waitFor();
    expect(await theme()).toBe('dark'); // remembered
    expect(await page.locator('.react-flow').getAttribute('class')).toContain('dark'); // React Flow's own colours follow
    if (process.env.T133_SHOT) await page.screenshot({ path: process.env.T133_SHOT });
    await page.getByRole('button', { name: 'Dark theme' }).click();
    expect(await theme()).toBe('light');
  }, 30_000);
});

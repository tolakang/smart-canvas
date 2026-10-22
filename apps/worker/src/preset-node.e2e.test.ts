/**
 * D46 end to end: a Preset node from the canvas menu adds every size of a preset family (GDN: 7), each an output
 * with its own Preview wired from its row; the master preview wires into the node once. Cutting a row's wire
 * disconnects that size; wiring the row back reconnects it. Delete removes the node with its sizes.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('Preset node (D46)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1920, height: 1200 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Presets');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const preset = () => page.locator('.react-flow__node-presetNode');
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  async function drag(from: Locator, to: Locator | { x: number; y: number }) {
    const a = await centre(from);
    const b = 'boundingBox' in to ? await centre(to) : to;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
  }
  const emptySpot = async () =>
    page.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!pane) throw new Error('no canvas');
      for (let y = pane.top + 60; y < pane.bottom - 60; y += 30)
        for (let x = pane.left + 40; x < pane.right - 60; x += 30)
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      throw new Error('no empty spot');
    });
  const fit = async () => {
    await page.getByRole('button', { name: 'Fit to screen (Shift+1)' }).click();
    await page.waitForTimeout(300);
  };
  const compositionWires = async () => (await doc()).edges.filter((e) => e.kind === 'composition').map((e) => e.to);

  it('the canvas menu adds a GDN Preset node: 7 sizes, each a preview wired from its row', async () => {
    // The team's presets load after the board: reopen the menu until the family is listed.
    const item = page.getByRole('menu').getByRole('menuitem', { name: 'GDN preset (7 sizes)' });
    await expect
      .poll(async () => {
        if (await page.getByRole('menu').count()) await page.keyboard.press('Escape');
        const at = await emptySpot();
        await page.mouse.click(at.x, at.y, { button: 'right' });
        await page.getByRole('menu').waitFor();
        return item.count();
      }, { timeout: 20_000 })
      .toBe(1);
    await item.click();
    await preset().waitFor();
    await saved();
    const d = await doc();
    const set = d.presetSets?.[0];
    expect(set?.label).toBe('GDN');
    expect(set?.outputs).toHaveLength(7);
    const labels = (set?.outputs ?? []).map((id) => d.outputs.find((o) => o.id === id)?.label);
    expect([...labels].sort()).toEqual(['GDN 1200×200', 'GDN 1200×628', 'GDN 300×250', 'GDN 320×100', 'GDN 440×140', 'GDN 728×90', 'GDN 900×1600']);
    // Rows in the set's order, as "W × H".
    expect(await preset().locator('.sc-preset__size').allInnerTexts()).toEqual(labels.map((l) => l?.replace(/^GDN (\d+)×(\d+)$/, '$1 × $2')));
    // One wire into the node, one out of each row.
    expect(await page.locator(`.react-flow__edge[data-id="setin:${set?.id}"]`).count()).toBe(1);
    await fit();
    for (const o of set?.outputs ?? []) expect(await page.locator(`.react-flow__node-outputNode[data-id="out:${o}"]`).count()).toBe(1);
  }, 90_000);

  it('cutting a row’s wire disconnects that size; wiring the row back reconnects it', async () => {
    const set = (await doc()).presetSets?.[0];
    const id = set?.outputs[3] ?? '';
    const wire = (await doc()).edges.find((e) => e.kind === 'composition' && e.to === id)?.id ?? '';
    await drag(page.locator(`.react-flow__edge[data-id="${wire}"] .react-flow__edgeupdater-target`), await emptySpot());
    await expect.poll(compositionWires).not.toContain(id);
    expect((await doc()).outputs.find((o) => o.id === id)?.frozen).toBeDefined();
    await expect.poll(() => preset().locator(`[data-output="${id}"]`).innerText()).toContain('disconnected');
    await drag(preset().locator(`.react-flow__handle[data-handleid="row:${id}"]`), page.locator(`.react-flow__node-outputNode[data-id="out:${id}"] .sc-handle--composition`));
    await expect.poll(compositionWires).toContain(id);
  }, 60_000);

  it('a Preview exports itself; Delete removes the node with its sizes', async () => {
    const before = await doc();
    const id = before.presetSets?.[0]?.outputs[0] ?? '';
    await page.locator(`.react-flow__node-outputNode[data-id="out:${id}"]`).getByRole('button', { name: /^Export output/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Export 1 output/ }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await preset().locator('.sc-node__title').click();
    page.once('dialog', (d) => void d.accept());
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await doc()).presetSets).toBeUndefined();
    expect((await doc()).outputs).toHaveLength(before.outputs.length - 7);
  }, 60_000);
});

/**
 * T8.4 / D49 end to end: right-click the empty canvas to add an asset node or a Preset node; the new node
 * appears where the canvas was clicked.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('right-click the canvas to add nodes (T8.4)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Menu');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const menu = () => page.getByRole('menu');

  /** Right-clicks an empty spot of the canvas (room for a node below-right of it) and returns it. */
  async function rightClickEmpty(): Promise<{ x: number; y: number }> {
    const at = await page.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!pane) return null;
      const isPane = (x: number, y: number) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane');
      for (let y = pane.bottom - 360; y > pane.top + 40; y -= 40)
        for (let x = pane.right - 340; x > pane.left + 40; x -= 40) {
          // The spot and a node-sized area below-right of it must be empty canvas.
          if ([0, 150, 300].every((dx) => [0, 150, 300].every((dy) => isPane(x + dx, y + dy)))) return { x, y };
        }
      return null;
    });
    if (!at) throw new Error('no empty spot on the canvas');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await menu().waitFor();
    return at;
  }
  const near = async (node: Locator, at: { x: number; y: number }) => {
    const b = await node.boundingBox();
    return !!b && Math.abs(b.x - at.x) < 3 && Math.abs(b.y - at.y) < 3;
  };

  it('offers the asset nodes, a Preset node per preset family, and a custom preset', async () => {
    // The team's presets (the Preset node items) load after the board: reopen until they are listed.
    await expect
      .poll(async () => {
        if (await menu().count()) await page.keyboard.press('Escape');
        await rightClickEmpty();
        return menu().getByRole('menuitem', { name: 'GDN preset (7 sizes)' }).count();
      }, { timeout: 20_000 })
      .toBe(1);
    const items = await menu().getByRole('menuitem').allInnerTexts();
    // D49: the asset nodes, then a Preset node per preset family, then a custom one; N4: then Tidy board.
    expect(items.slice(0, 5)).toEqual(['Logo node', 'Headline node (Khmer / English)', 'Text node', 'Image node', 'Background node']);
    for (const p of ['FB preset (1 size)', 'GDN preset (7 sizes)', 'Website preset (4 sizes)', 'App banner preset (2 sizes)']) expect(items).toContain(p);
    expect(items.slice(-2)).toEqual(['Custom preset…', 'Tidy board']);
    await page.keyboard.press('Escape');
  }, 30_000);

  it('Text node adds a Text node with one slot, at the click', async () => {
    const at = await rightClickEmpty();
    const before = (await doc()).stacks?.length ?? 0;
    await menu().getByRole('menuitem', { name: 'Text node', exact: true }).click();
    const node = page.locator('.react-flow__node-textNode').nth(1);
    await node.waitFor();
    expect(await near(node, at)).toBe(true);
    await saved();
    const d = await doc();
    expect(d.stacks).toHaveLength(before + 1);
    const card = d.stacks?.at(-1);
    expect(card).toMatchObject({ kind: 'text', label: 'Text' });
    expect(d.sources.find((s) => s.id === card?.items[0])).toMatchObject({ kind: 'text', behavesLike: 'text', label: 'Text 1' });
    // + Add text adds another slot, its own layer.
    await node.getByRole('button', { name: 'Add text' }).click();
    await saved();
    expect((await doc()).stacks?.at(-1)?.items).toHaveLength(2);
  }, 60_000);

  it('a preset family adds its Preset node at the click (or, N4, the nearest clear spot right of / below it), wired from Main Comps, a Preview per size', async () => {
    const at = await rightClickEmpty();
    await menu().getByRole('menuitem', { name: 'Website preset (4 sizes)' }).click();
    const set = page.locator('.react-flow__node-presetNode');
    await set.waitFor();
    const b = await set.boundingBox();
    expect(b && b.x >= at.x - 3 && b.y >= at.y - 3).toBe(true);
    await saved();
    const d = await doc();
    expect(d.presetSets?.[0]).toMatchObject({ label: 'Website' });
    expect(d.presetSets?.[0]?.outputs).toHaveLength(4);
    for (const o of d.presetSets?.[0]?.outputs ?? []) expect(d.edges.some((e) => e.kind === 'composition' && e.from === 'main' && e.to === o)).toBe(true);
  }, 60_000);
});

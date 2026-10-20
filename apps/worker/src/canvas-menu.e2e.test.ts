/**
 * T8.4 end to end: right-click the empty canvas to add an input (quick kinds or the full dialog) or an output,
 * and the new node appears where the canvas was clicked.
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
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
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

  it('offers the quick inputs, the input dialog and the output dialog', async () => {
    await rightClickEmpty();
    expect(await menu().getByRole('menuitem').allInnerTexts()).toEqual([
      'Image input',
      'Logo / SVG input',
      'Text input',
      'Colour / gradient input',
      'Input…',
      'Output…',
    ]);
    await page.keyboard.press('Escape');
  }, 30_000);

  it('Text input adds a text input whose node sits at the click', async () => {
    const at = await rightClickEmpty();
    await menu().getByRole('menuitem', { name: 'Text input' }).click();
    const node = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Text$/ }) });
    await node.waitFor();
    expect(await near(node, at)).toBe(true);
    await saved();
    expect((await doc()).sources.find((s) => s.label === 'Text')).toMatchObject({ kind: 'text', behavesLike: 'text' });
  }, 60_000);

  it('Output… opens the output dialog and places the output at the click', async () => {
    const at = await rightClickEmpty();
    await menu().getByRole('menuitem', { name: 'Output…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Preset').selectOption({ label: 'Instagram square · 1080×1080 px' });
    await dialog.getByRole('button', { name: 'Add' }).click();
    const out = page.getByLabel('Output Instagram square', { exact: true });
    await out.waitFor();
    expect(await near(page.locator('.react-flow__node-outputNode').first(), at)).toBe(true);
    await saved();
    const d = await doc();
    expect(d.wires.some((w) => w.from === 'main' && w.to === d.outputs[0]?.id)).toBe(true);
  }, 60_000);

  it('the toolbar "+ Add input" still uses the default column, not the last click', async () => {
    await page.getByRole('button', { name: '+ Add input' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Band');
    await dialog.getByRole('button', { name: 'Add' }).click();
    await saved();
    const band = (await doc()).sources.find((s) => s.label === 'Band');
    expect(band?.board.x).toBe(-460);
  }, 60_000);
});

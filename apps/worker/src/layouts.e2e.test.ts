/**
 * PR 2 of the page-3 board (D50) end to end. The Square / Vertical / Horizontal editors share the master's
 * layers: order, lock, hide and delete apply in all three layouts; a locked layer can't be picked or moved on
 * the canvas. The Core preset (V2: always shown) lists the outputs in their layout's section; dragging one into another
 * section assigns that layout (added if needed), and × puts it back on the closest one.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addPresetSet, guidesOf, MAIN, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, openLayout, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('layouts and the Core preset (D50)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Layouts');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const px = (width: number, height: number) => ({ width, height, unit: 'px' as const });
    const r = addPresetSet(p.doc, { id: 'gdn', label: 'GDN', board: { x: 420, y: 1160 }, sizes: [{ id: 'g1', label: 'GDN 300×250', size: px(300, 250) }, { id: 'g2', label: 'GDN 728×90', size: px(728, 90) }, { id: 'g3', label: 'GDN 900×1600', size: px(900, 1600) }] });
    if (!r.ok) throw new Error(r.error);
    expect((await page.request.put(url, { data: { rev: p.rev, doc: r.doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-presetNode').waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const editor = () => page.getByRole('dialog', { name: /Main Comps editor/ });
  const layersPanel = () => editor().getByRole('complementary', { name: 'Layers' });
  const close = async () => {
    await page.keyboard.press('Escape');
    await editor().waitFor({ state: 'detached' });
  };

  it('a locked layer is not picked on the canvas, nor deleted with the Delete key; unlock restores it', async () => {
    await openLayout(page);
    await layersPanel().getByRole('button', { name: 'Lock layer Background' }).click();
    await saved();
    expect((await doc()).sources.find((s) => s.id === 'background')?.locked).toBe(true);
    // A press on the canvas corner (only the background there) selects nothing.
    const canvas = await editor().locator('.sc-editor__canvas .sc-render').first().boundingBox();
    if (!canvas) throw new Error('no canvas');
    await page.mouse.click(canvas.x + 4, canvas.y + canvas.height - 4);
    await page.waitForTimeout(200);
    expect(await editor().locator('.sc-layer--selected').count()).toBe(0);
    await layersPanel().getByRole('button', { name: 'Unlock layer Background' }).click();
    await saved();
    expect((await doc()).sources.find((s) => s.id === 'background')?.locked).toBeUndefined();
    await close();
  }, 60_000);

  it('the Vertical layout lists the master’s layers — also one added after the layout — and deleting there deletes everywhere', async () => {
    await openLayout(page, 'Vertical');
    await close();
    // A new text slot, after the vertical layout exists.
    await boardNode(page, 'Text').getByRole('button', { name: 'Add text' }).click();
    await saved();
    const added = (await doc()).sources.find((s) => s.label === 'Text 2');
    expect(added).toBeTruthy();
    await openLayout(page, 'Vertical');
    await layersPanel().locator(`[data-layer="${added?.id}"]`).waitFor();
    expect(await editor().locator(`.sc-editor__canvas [data-source-id="${added?.id}"]`).count()).toBeGreaterThan(0);
    page.once('dialog', (d) => void d.accept());
    await layersPanel().getByRole('button', { name: 'Delete Text 2' }).click();
    await saved();
    expect((await doc()).sources.some((s) => s.id === added?.id)).toBe(false);
    await close();
  }, 60_000);

  it('Core preset: each output in its closest layout; dragged into another section it follows that one', async () => {
    // V2: shown on the board without opening anything, and no Core Auto Layout Guide.
    expect(await page.getByRole('button', { name: /Core (Preset|Auto Layout) Guide/ }).count()).toBe(0);
    const section = (f: string) => page.getByRole('listitem', { name: `${f} layout` });
    await expect.poll(() => section('Square').locator('[data-output]').evaluateAll((els) => els.map((e) => e.getAttribute('data-output')))).toEqual(['g1']);
    expect(await section('Horizontal').locator('[data-output="g2"]').count()).toBe(1);
    expect(await section('Vertical').locator('[data-output="g3"]').count()).toBe(1);
    // The wide banner dragged into Square.
    await section('Horizontal').locator('[data-output="g2"]').dragTo(section('Square'));
    await saved();
    let d = await doc();
    expect(d.outputs.find((o) => o.id === 'g2')?.layout).toBe('square');
    await expect.poll(() => section('Square').locator('[data-output="g2"]').count()).toBe(1);
    // Into Horizontal (not added yet): the layout is added and the banner follows it.
    await section('Square').locator('[data-output="g2"]').dragTo(section('Horizontal'));
    await saved();
    d = await doc();
    expect(d.outputs.find((o) => o.id === 'g2')?.layout).toBe('horizontal');
    expect(guidesOf(d, MAIN).some((g) => g.guide?.family === 'horizontal')).toBe(true);
    // × puts it back on the closest layout.
    await section('Horizontal').getByRole('button', { name: /back to the closest layout/ }).click();
    await saved();
    expect((await doc()).outputs.find((o) => o.id === 'g2')?.layout).toBeUndefined();
    // UX B4 (F9): the same move without dragging — the chip's "Move to" menu, by keyboard.
    const move = section('Horizontal').getByRole('button', { name: /Move .* to another layout/ }).first();
    await move.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Move to Vertical' }).focus();
    await page.keyboard.press('Enter');
    await saved();
    expect((await doc()).outputs.find((o) => o.id === 'g2')?.layout).toBe('vertical');
  }, 60_000);
});

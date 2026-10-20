/**
 * T12.4 end to end: output-only layers. Wire an input onto an output's "Add a layer" row: only that output
 * draws it (above the main preview's layers), its editor lists it, and the × takes it off again. An input the
 * output's main preview already draws is refused with a hint.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('output-only layers (T12.4)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'OwnLayers');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const panel = () => page.getByRole('complementary', { name: 'Node library' });
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  async function drag(from: Locator, to: Locator) {
    const a = await centre(from);
    const b = await centre(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
  }

  it('wire an input onto an output row: only that output draws it, above the main preview', async () => {
    // Each at its own spot in the free column left of the inputs, so nothing overlaps.
    const pane = page.locator('.react-flow__pane');
    const box = await pane.boundingBox();
    if (!box) throw new Error('no pane');
    await panel().getByRole('button', { name: /^Instagram square/ }).dragTo(pane, { targetPosition: { x: 30, y: box.height - 300 } });
    await panel().getByRole('button', { name: /^Instagram square/ }).dragTo(pane, { targetPosition: { x: 30, y: 300 } });
    await panel().getByRole('button', { name: /^Text/ }).dragTo(pane, { targetPosition: { x: 30, y: 30 } });
    await expect.poll(async () => (await doc()).outputs.length).toBe(2);
    await saved();
    const d = await doc();
    const [a, b] = d.outputs;
    const text = d.sources.at(-1);
    if (!a || !b || !text) throw new Error('setup');
    expect(d.edges.some((e) => e.from === text.id)).toBe(false); // a new input starts unwired
    const outNode = page.locator(`.react-flow__node-outputNode[data-id="out:${a.id}"]`);
    await drag(page.locator(`.react-flow__node-inputNode[data-id="src:${text.id}"] .react-flow__handle.source`), outNode.locator('.sc-port--add .react-flow__handle'));
    await expect.poll(async () => (await doc()).outputs.find((o) => o.id === a.id)?.layers).toEqual([text.id]);
    const after = await doc();
    expect(after.edges.some((e) => e.kind === 'layer' && e.from === text.id && e.to === a.id)).toBe(true);
    expect(after.outputs.find((o) => o.id === b.id)?.layers).toBeUndefined();
    await outNode.getByRole('list', { name: /own layers/ }).getByText(text.label).waitFor();
    await page.locator(`.react-flow__edge[data-id="in:${text.id}>${a.id}"]`).waitFor();

    // Its editor lists it first ("only this output").
    await outNode.getByRole('button', { name: /^Edit output/ }).click();
    const layers = page.getByRole('complementary', { name: 'Layers' });
    await expect.poll(async () => (await layers.locator('.sc-layer').first().textContent()) ?? '').toContain('only this output');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  }, 90_000);

  it('an input the main preview already draws is refused; × removes the layer', async () => {
    const d = await doc();
    const a = d.outputs[0];
    const own = a?.layers?.[0];
    if (!a || !own) throw new Error('setup');
    const outNode = page.locator(`.react-flow__node-outputNode[data-id="out:${a.id}"]`);
    await page.locator('.react-flow__node-mainNode').getByRole('button', { name: 'Connect Logo' }).click();
    await saved();
    await drag(page.locator('.react-flow__node-inputNode[data-id="src:logo"] .react-flow__handle.source'), outNode.locator('.sc-port--add .react-flow__handle'));
    await page.getByRole('alert').getByText('already a layer of the output’s main preview').waitFor();
    expect((await doc()).outputs[0]?.layers).toEqual([own]);
    const label = d.sources.find((s) => s.id === own)?.label ?? '';
    await outNode.getByRole('button', { name: `Remove ${label} from ${a.label}` }).click();
    await expect.poll(async () => (await doc()).outputs[0]?.layers).toBeUndefined();
    expect((await doc()).edges.some((e) => e.to === a.id && e.kind === 'layer')).toBe(false);
  }, 60_000);
});

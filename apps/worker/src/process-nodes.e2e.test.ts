/**
 * T12.5 end to end on the board: add a Crop from the node library, wire an input into it and its result onto
 * the main preview's "Wire a process here" row, change the crop in the inspector, then delete it.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('process nodes on the board (T12.5)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'ProcessBoard');
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

  it('add a Crop, wire input → crop → main preview row, change it, delete it', async () => {
    const pane = page.locator('.react-flow__pane');
    const box = await pane.boundingBox();
    if (!box) throw new Error('no pane');
    await panel().getByRole('button', { name: /^Crop/ }).dragTo(pane, { targetPosition: { x: 30, y: 300 } });
    await expect.poll(async () => (await doc()).processes.length).toBe(1);
    const crop = (await doc()).processes[0];
    if (!crop) throw new Error('no process');
    expect(crop.op).toEqual({ type: 'crop', rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    const node = page.locator(`.react-flow__node-processNode[data-id="proc:${crop.id}"]`);
    await node.getByText('Wire an input in').waitFor();

    await drag(page.locator('.react-flow__node-inputNode[data-id="src:background"] .react-flow__handle.source'), node.locator('.react-flow__handle.target'));
    await expect.poll(async () => (await doc()).edges.some((e) => e.from === 'background' && e.to === crop.id)).toBe(true);
    await node.locator('.sc-render [data-source-id]').waitFor();

    await drag(node.locator('.react-flow__handle.source'), page.locator('.react-flow__node-mainNode .sc-port--add .react-flow__handle'));
    await expect.poll(async () => (await doc()).compositions[0]?.layers.includes(crop.id)).toBe(true);
    expect((await doc()).edges.some((e) => e.from === crop.id && e.to === 'main' && e.kind === 'layer')).toBe(true);
    await page.locator('.react-flow__node-mainNode .sc-port').filter({ hasText: 'Crop' }).waitFor();

    // Inspector: select the node, change the crop width.
    await node.locator('.sc-node__title').click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await inspector.getByText('Takes Background').waitFor();
    await inspector.getByLabel('Crop width').fill('50');
    await inspector.getByLabel('Crop width').press('Enter');
    await expect.poll(async () => (await doc()).processes[0]?.op).toEqual({ type: 'crop', rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.8 } });
    await node.getByText('Keeps 50% × 80%').waitFor();
    await saved();

    page.once('dialog', (d) => void d.accept());
    await node.getByRole('button', { name: `Delete process ${crop.label}` }).click();
    await expect.poll(async () => (await doc()).processes.length).toBe(0);
    const after = await doc();
    expect(after.compositions[0]?.layers.includes(crop.id)).toBe(false);
    expect(after.edges.some((e) => e.from === crop.id || e.to === crop.id)).toBe(false);
  }, 90_000);

  it('T12.6: a Text variant takes the headline and other words, set in the inspector', async () => {
    const pane = page.locator('.react-flow__pane');
    await panel().getByRole('button', { name: /^Text variant/ }).dragTo(pane, { targetPosition: { x: 30, y: 300 } });
    await expect.poll(async () => (await doc()).processes.length).toBe(1);
    const variant = (await doc()).processes[0];
    if (!variant) throw new Error('no process');
    const node = page.locator(`.react-flow__node-processNode[data-id="proc:${variant.id}"]`);
    await drag(page.locator('.react-flow__node-inputNode[data-id="src:headline"] .react-flow__handle.source'), node.locator('.react-flow__handle.target'));
    await expect.poll(async () => (await doc()).edges.some((e) => e.from === 'headline' && e.to === variant.id)).toBe(true);
    await node.locator('.sc-node__title').click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await inspector.getByLabel('Variant text').fill('សួស្តី Hola');
    await inspector.getByLabel('Variant font size').click(); // blur commits the text
    await expect.poll(async () => (await doc()).processes[0]?.op).toEqual({ type: 'textVariant', text: 'សួស្តី Hola', style: {} });
    await node.getByText('“សួស្តី Hola”').waitFor();
    await node.locator('.sc-render [data-source-id]').getByText('សួស្តី Hola').waitFor();
  }, 90_000);
});

/**
 * T12.7 end to end: the node palette. A wire dragged out of an input and dropped on empty canvas offers the
 * nodes that fit (processes, a main preview); the one chosen is added at the drop point, already wired. A
 * right-click on a port opens the same palette for it (here: a new input wired into the main preview).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('node palette (T12.7)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Palette');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const palette = () => page.getByRole('menu', { name: 'Add & connect' });
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  it('drop a wire from an input on empty canvas: pick a process, it is added there and wired', async () => {
    const from = await centre(page.locator('.react-flow__node-inputNode[data-id="src:subject"] .react-flow__handle.source'));
    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    const to = { x: pane.x + 40, y: pane.y + 60 }; // the free column left of the inputs
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 20 });
    await page.mouse.up();
    expect(await palette().getByRole('menuitem').allInnerTexts()).toEqual(['Crop', 'Adjust', 'Flip / Rotate', 'Text variant', 'Recolor', 'New main preview']);
    await palette().getByRole('menuitem', { name: 'Adjust' }).click();
    await expect.poll(async () => (await doc()).processes.length).toBe(1);
    const p = (await doc()).processes[0];
    expect(p?.op.type).toBe('adjust');
    expect((await doc()).edges.some((e) => e.from === 'subject' && e.to === p?.id)).toBe(true);
    const handle = await centre(page.locator(`.react-flow__node-processNode[data-id="proc:${p?.id}"] .react-flow__handle.target`));
    expect(Math.abs(handle.x - to.x)).toBeLessThan(30);
    expect(Math.abs(handle.y - to.y)).toBeLessThan(80);
  }, 60_000);

  it('right-click a port: its palette (a new input wired into the main preview)', async () => {
    const before = (await doc()).sources.length;
    await page.locator('.react-flow__node-mainNode .sc-port--add .react-flow__handle').click({ button: 'right' });
    expect(await palette().getByRole('menuitem').allInnerTexts()).toEqual(['Image', 'Logo / SVG', 'Text', 'Background colour']);
    await palette().getByRole('menuitem', { name: 'Text' }).click();
    await expect.poll(async () => (await doc()).sources.length).toBe(before + 1);
    const added = (await doc()).sources.at(-1);
    expect((await doc()).edges.some((e) => e.from === added?.id && e.to === 'main' && e.kind === 'layer')).toBe(true);
  }, 60_000);
});

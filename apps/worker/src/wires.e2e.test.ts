/**
 * T8.5 / D49 end to end: on the page-3 board every asset node wires into the top of the Layer Comp group, one
 * wire per node (a card's wire stands for all its items). A wire cut with its ✂ badge, or its end dropped on empty
 * canvas, disconnects; a wire dragged from a node onto the group connects. A wire dragged out of the group onto
 * empty canvas offers the Preset nodes. Ports are typed: a wire dropped where it doesn't fit is refused, with why.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { wiredLayers, type ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('wires attach and detach (T8.5, D49)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Wires');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const wired = async () => wiredLayers(await doc(), 'main');
  const textCard = async () => (await doc()).stacks?.find((st) => st.kind === 'text');
  const textWire = async () => `card:stk:${(await textCard())?.id}`;
  const groupTop = () => page.locator('.react-flow__node-mainNode .react-flow__handle[data-handleid="layers"]');
  const nodeHandle = (l: Locator) => l.locator('.react-flow__handle.source');
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
      for (let y = pane.bottom - 120; y > pane.top + 60; y -= 30)
        for (let x = pane.left + 60; x < pane.right - 60; x += 30)
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      throw new Error('no empty spot');
    });

  it('every asset node has one wire into the top of the Layer Comp group; no ✂ badge rests on them (V1)', async () => {
    const d = await doc();
    for (const s of d.sources) expect((await wired()).has(s.id)).toBe(true);
    // Logo, Headline, Text, Image (cards: one wire each) and Background.
    const edges = page.locator('.react-flow__edge');
    await expect.poll(() => edges.count()).toBe(5);
    expect(await page.locator('.react-flow__edgelabel-renderer .sc-wire-cut').count()).toBe(0);
  }, 30_000);

  it('a selected wire shows the ✂ badge; it cuts a card’s wire: every item of the card is disconnected', async () => {
    const card = await textCard();
    // Selecting the wire (a tap on touch) brings its badge.
    await page.locator(`.react-flow__edge[data-id="${await textWire()}"]`).dispatchEvent('click');
    await page.locator(`.react-flow__edgelabel-renderer [data-edge="${await textWire()}"]`).click();
    await saved();
    for (const id of card?.items ?? []) expect((await wired()).has(id)).toBe(false);
    expect(await page.locator(`.react-flow__edge[data-id="${await textWire()}"]`).count()).toBe(0);
  }, 60_000);

  it('a wire dragged from the node onto the group connects every item again', async () => {
    const card = await textCard();
    await drag(nodeHandle(boardNode(page, 'Text')), groupTop());
    await expect.poll(async () => { const w = await wired(); return (card?.items ?? []).every((id) => w.has(id)); }).toBe(true);
    await page.locator(`.react-flow__edge[data-id="${await textWire()}"]`).waitFor();
  }, 60_000);

  it('dropping a wire end on empty canvas detaches it', async () => {
    // By its node end (many wires meet at the group's port).
    await drag(page.locator('.react-flow__edge[data-id="in:background"] .react-flow__edgeupdater-source'), await emptySpot());
    await expect.poll(async () => (await wired()).has('background')).toBe(false);
    expect(await page.locator('.react-flow__edge[data-id="in:background"]').count()).toBe(0);
  }, 60_000);

  it('a wire dragged out of the group onto empty canvas offers the Preset nodes; the one chosen is added there, wired', async () => {
    const spot = await emptySpot();
    // The team's presets load after the board: retry until the family is listed.
    const item = page.getByRole('menu', { name: 'Add a Preset node' }).getByRole('menuitem', { name: 'GDN preset (7 sizes)' });
    await expect
      .poll(async () => {
        if (await page.getByRole('menu').count()) await page.keyboard.press('Escape');
        await drag(page.locator('.react-flow__node-mainNode .react-flow__handle[data-handleid="out"]'), spot);
        return item.count();
      }, { timeout: 20_000 })
      .toBe(1);
    await item.click();
    await saved();
    const d = await doc();
    expect(d.presetSets?.[0]).toMatchObject({ label: 'GDN' });
    for (const o of d.presetSets?.[0]?.outputs ?? []) expect(d.edges.some((e) => e.kind === 'composition' && e.from === 'main' && e.to === o)).toBe(true);
  }, 60_000);

  it('typed ports: an asset node dropped on a Preset node is refused, with the reason', async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    const before = (await doc()).edges.length;
    await drag(nodeHandle(boardNode(page, 'Logo')), page.locator('.react-flow__node-presetNode .react-flow__handle.target'));
    await expect.poll(() => page.getByRole('alert').innerText()).toBe('An asset node wires into the Layer Comp.');
    expect((await doc()).edges.length).toBe(before);
  }, 60_000);
});

/**
 * T13.5 end to end: canvas chrome. The floating toolbar switches Select / Hand (and V / H), zooms and fits,
 * toggles grid snap and the minimap (remembered); the wheel pans and Ctrl + wheel zooms; a dragged node snaps
 * to another node's edge.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('canvas chrome (T13.5)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1700, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Chrome');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const bar = () => page.getByRole('toolbar', { name: 'Canvas tools' });
  const zoom = async () => Number((await bar().getByLabel('Board zoom').textContent())?.replace('%', ''));
  const transform = () => page.locator('.react-flow__viewport').evaluate((el) => getComputedStyle(el).transform);

  it('tools: buttons and V / H keys', async () => {
    const select = bar().getByRole('button', { name: 'Select (V)' });
    const hand = bar().getByRole('button', { name: /^Hand/ });
    expect(await select.getAttribute('aria-pressed')).toBe('true');
    await hand.click();
    expect(await hand.getAttribute('aria-pressed')).toBe('true');
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('v');
    expect(await select.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('h');
    expect(await hand.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('v');
  }, 60_000);

  it('zoom in / out, fit; wheel pans, Ctrl + wheel zooms', async () => {
    const z0 = await zoom();
    await bar().getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(zoom).toBeGreaterThan(z0);
    await bar().getByRole('button', { name: 'Zoom out' }).click();
    await bar().getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(zoom).toBeLessThan(z0);
    await bar().getByRole('button', { name: /^Fit to screen/ }).click();
    await expect.poll(zoom).toBe(z0);

    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    const t0 = await transform();
    await page.mouse.wheel(0, 200);
    await expect.poll(transform).not.toBe(t0);
    expect(await zoom()).toBe(z0); // panned, not zoomed
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(zoom).toBeGreaterThan(z0);
    await bar().getByRole('button', { name: /^Fit to screen/ }).click();
  }, 60_000);

  it('grid snap and minimap toggles, remembered across a reload', async () => {
    const grid = bar().getByRole('button', { name: 'Snap to grid' });
    const map = bar().getByRole('button', { name: 'Minimap' });
    expect(await grid.getAttribute('aria-pressed')).toBe('false');
    expect(await page.locator('.react-flow__minimap').count()).toBe(1);
    await grid.click();
    await map.click();
    expect(await page.locator('.react-flow__minimap').count()).toBe(0);
    await page.reload();
    await bar().waitFor();
    expect(await bar().getByRole('button', { name: 'Snap to grid' }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.react-flow__minimap').count()).toBe(0);
    await bar().getByRole('button', { name: 'Snap to grid' }).click();
    await bar().getByRole('button', { name: 'Minimap' }).click();
  }, 60_000);

  it('a dragged node snaps to the left edge of another', async () => {
    const d = await doc();
    const source = d.sources[0];
    if (!source) throw new Error('no input');
    const main = await page.locator('.react-flow__node-mainNode[data-id="main"]').boundingBox();
    const node = page.locator(`.react-flow__node-inputNode[data-id="src:${source.id}"]`);
    const box = await node.boundingBox();
    if (!main || !box) throw new Error('no nodes');
    // Grab the input by its header and drop it below the master preview, 3 px right of its left edge.
    const grab = { x: box.x + 20, y: box.y + 10 };
    const to = { x: main.x + 3 + 20, y: main.y + main.height + 80 + 10 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1, grab.y + 1); // starts the drag (React Flow measures from here)
    await page.mouse.move((grab.x + to.x) / 2, (grab.y + to.y) / 2, { steps: 8 });
    await page.mouse.move(to.x + 1, to.y + 1, { steps: 8 });
    await expect.poll(() => page.locator('.sc-guide--v').count()).toBe(1); // drag moves land a frame later
    await page.mouse.up();
    expect(await page.locator('.sc-guide').count()).toBe(0);
    // Autosave waits 800 ms after the drop: give the save time to land (the default 1 s poll races it on slow runners).
    const masterX = (await doc()).compositions[0]?.board.x;
    await expect.poll(async () => (await doc()).sources.find((s) => s.id === source.id)?.board.x, { timeout: 15_000 }).toBe(masterX);
  }, 60_000);

  it('every tool has a tooltip on hover: its name, what it does, its shortcut', async () => {
    const select = bar().getByRole('button', { name: 'Select (V)' });
    await select.hover();
    const tip = page.locator('.sc-tip--show');
    await tip.waitFor();
    expect(await tip.innerText()).toMatch(/Select\s*V[\s\S]*drag on empty canvas to select several/);
    expect(await select.getAttribute('aria-describedby')).toBe(await tip.getAttribute('id'));
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/toolbar-tip.png`, clip: await bar().boundingBox().then((b) => ({ x: (b?.x ?? 0) - 40, y: (b?.y ?? 0) - 120, width: (b?.width ?? 0) + 80, height: (b?.height ?? 0) + 130 })) });
    await bar().getByRole('button', { name: 'Tidy board' }).hover();
    await expect.poll(() => tip.innerText()).toContain('Arrange all panels');
    await page.mouse.move(5, 5);
    await tip.waitFor({ state: 'detached' });
  }, 30_000);

  it('Hand moves the board only: dragging a panel pans, the panel stays where it was in the doc', async () => {
    await page.keyboard.press('h');
    const before = (await doc()).compositions.find((c) => c.id === 'main')?.board;
    const head = page.locator('.react-flow__node-mainNode .sc-node__title').first();
    const b = await head.boundingBox();
    if (!b) throw new Error('no group');
    const t0 = await transform();
    await page.mouse.move(b.x + 10, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + 80, b.y + 60, { steps: 6 });
    await page.mouse.up();
    await expect.poll(transform).not.toBe(t0);
    await page.waitForTimeout(1200);
    expect((await doc()).compositions.find((c) => c.id === 'main')?.board).toEqual(before);
    expect(await page.locator('.react-flow__node-mainNode.selected').count()).toBe(0);
    await page.keyboard.press('v');
  }, 30_000);

  it('Select: a drag on empty canvas selects several panels; the selection bar groups them', async () => {
    await bar().getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } }); // nothing selected to start
    const boxes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.react-flow__node')].map((n) => ({ id: n.dataset.id ?? '', r: n.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number } })));
    const row = boxes.filter((b) => b.id.startsWith('stk:') || b.id.startsWith('hl:')).sort((a, b) => a.r.x - b.r.x).slice(0, 2);
    const from = { x: Math.max(...row.map((b) => b.r.x + b.r.width)) + 4, y: Math.max(...row.map((b) => b.r.y + b.r.height)) + 30 };
    const to = { x: Math.min(...row.map((b) => b.r.x)) - 4, y: Math.min(...row.map((b) => b.r.y)) - 4 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    const selbar = page.getByRole('toolbar', { name: 'Selection' });
    await selbar.getByText('2 selected').waitFor();
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/selection.png` });
    await selbar.getByRole('button', { name: 'Group' }).click();
    await expect.poll(async () => (await doc()).groups?.[0]?.nodes.sort(), { timeout: 15_000 }).toEqual(row.map((b) => b.id.replace(/^(stk|hl):/, '')).sort());
    await selbar.getByRole('button', { name: 'Clear selection' }).click();
    await selbar.waitFor({ state: 'detached' });
  }, 30_000);

  const panelsSelected = () => page.locator('.react-flow__node.selected').count();
  const comp = () => page.locator('.react-flow__node-mainNode .sc-node__title').first();

  it('Select: Shift-click adds a panel, Esc clears the selection, Ctrl/⌘ + A selects every panel', async () => {
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await comp().click();
    expect(await panelsSelected()).toBe(1);
    const other = page.locator('.react-flow__node[data-id^="stk:"] .sc-node__title').last();
    await other.click({ modifiers: ['Shift'] });
    const selbar = page.getByRole('toolbar', { name: 'Selection' });
    await selbar.getByText('2 selected').waitFor();
    // Shift-click again takes it out.
    await other.click({ modifiers: ['Shift'] });
    await selbar.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await expect.poll(panelsSelected).toBe(0);
    await page.keyboard.press('ControlOrMeta+a');
    const all = await page.locator('.react-flow__node[data-id]:not([data-id^="grp:"])').count();
    await selbar.getByText(`${all} selected`).waitFor();
    await page.keyboard.press('Escape');
    await selbar.waitFor({ state: 'detached' });
  }, 30_000);

  it('arrow keys nudge the selected panel: saved, kept after a reload, one undo step per run of presses', async () => {
    const grid = bar().getByRole('button', { name: 'Snap to grid' });
    if ((await grid.getAttribute('aria-pressed')) === 'true') await grid.click();
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await comp().click();
    const start = (await doc()).compositions.find((c) => c.id === 'main')?.board ?? { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.press('Shift+ArrowDown');
    const board = async () => (await doc()).compositions.find((c) => c.id === 'main')?.board;
    await expect.poll(board, { timeout: 15_000 }).toEqual({ x: start.x + 3, y: start.y + 10 });
    // Undo: the Shift step, then the run of three.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(board, { timeout: 15_000 }).toEqual({ x: start.x + 3, y: start.y });
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(board, { timeout: 15_000 }).toEqual(start);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(board, { timeout: 15_000 }).toEqual({ x: start.x + 3, y: start.y });
    await page.reload();
    await bar().waitFor();
    expect(await board()).toEqual({ x: start.x + 3, y: start.y });
  }, 60_000);

  it('holding Space is the Hand tool while held: the button shows it, a drag pans and selects nothing', async () => {
    const select = bar().getByRole('button', { name: 'Select (V)' });
    const hand = bar().getByRole('button', { name: /^Hand/ });
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('Space');
    await expect.poll(() => hand.getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.sc-board__flow--hand').count()).toBe(1);
    const pane = await page.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    const t0 = await transform();
    await page.mouse.move(pane.x + 40, pane.y + pane.height - 40);
    await page.mouse.down();
    await page.mouse.move(pane.x + 240, pane.y + pane.height - 140, { steps: 6 });
    await page.mouse.up();
    await expect.poll(transform).not.toBe(t0);
    expect(await panelsSelected()).toBe(0);
    await page.keyboard.up('Space');
    await expect.poll(() => select.getAttribute('aria-pressed')).toBe('true');
  }, 30_000);

  /** Drags the input panel by its header by (dx, dy) screen px, with `hold` keys down (Alt). */
  const dragInput = async (dx: number, dy: number, hold?: string) => {
    const node = page.locator('.react-flow__node-inputNode').first();
    const box = await node.boundingBox();
    if (!box) throw new Error('no input');
    const grab = { x: box.x + 20, y: box.y + 10 };
    if (hold) await page.keyboard.down(hold);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1, grab.y + 1);
    await page.mouse.move(grab.x + dx, grab.y + dy, { steps: 10 });
    const guides = await page.locator('.sc-guide').count();
    await page.mouse.up();
    if (hold) await page.keyboard.up(hold);
    return { id: (await node.getAttribute('data-id'))?.replace('src:', '') ?? '', guides };
  };
  const inputBoard = async (id: string) => (await doc()).sources.find((s) => s.id === id)?.board;

  it('grid snap on: a drop lands on the 16 px grid and no alignment guides show; holding Alt places it freely (D57)', async () => {
    const grid = bar().getByRole('button', { name: 'Snap to grid' });
    if ((await grid.getAttribute('aria-pressed')) !== 'true') await grid.click();
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    const snapped = await dragInput(53, 37);
    expect(snapped.guides).toBe(0);
    await expect.poll(async () => { const b = await inputBoard(snapped.id); return b ? b.x % 16 === 0 && b.y % 16 === 0 : false; }, { timeout: 15_000 }).toBe(true);
    const before = await inputBoard(snapped.id);
    const free = await dragInput(29, 21, 'Alt');
    expect(free.guides).toBe(0);
    await expect.poll(async () => { const b = await inputBoard(free.id); return b && before ? b.x !== before.x && (b.x % 16 !== 0 || b.y % 16 !== 0) : false; }, { timeout: 15_000 }).toBe(true);
    await grid.click();
    expect(await grid.getAttribute('aria-pressed')).toBe('false');
  }, 60_000);

  it('Tidy: two panels selected → just those in a row, with an Undo notice; nothing selected → the whole board (D57)', async () => {
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    const panels = async () => {
      const d = await doc();
      return new Map<string, { x: number; y: number }>([...d.compositions.map((c) => [`c:${c.id}`, c.board] as const), ...d.sources.map((s) => [`s:${s.id}`, s.board] as const), ...d.outputs.map((o) => [`o:${o.id}`, o.board] as const)]);
    };
    // Spread the two panels apart first so there is something to tidy.
    const start = await panels();
    await comp().click();
    await page.locator('.react-flow__node-inputNode .sc-node__title').first().click({ modifiers: ['Shift'] });
    expect(await bar().getByRole('button', { name: 'Tidy selection' }).count()).toBe(1);
    await page.keyboard.press('Shift+T');
    const toast = page.locator('.sc-board__toast');
    await toast.getByText(/^(2 panels tidied|The selected panels are already tidy)$/).waitFor();
    const d = await doc();
    const mainId = `c:main`;
    const srcId = `s:${d.sources[0]?.id}`;
    await expect.poll(async () => { const p = await panels(); return p.get(mainId)?.y === p.get(srcId)?.y; }, { timeout: 15_000 }).toBe(true);
    // Panels not selected stay where they were.
    const after = await panels();
    for (const [id, b] of start) if (id !== mainId && id !== srcId) expect(after.get(id)).toEqual(b);
    if ((await toast.textContent())?.includes('tidied')) {
      await toast.getByRole('button', { name: 'Undo' }).click();
      await toast.waitFor({ state: 'detached' });
      await expect.poll(async () => (await panels()).get(mainId), { timeout: 15_000 }).toEqual(start.get(mainId));
    }
    await page.keyboard.press('Escape');
    expect(await bar().getByRole('button', { name: 'Tidy board' }).count()).toBe(1);
    await bar().getByRole('button', { name: 'Tidy board' }).click();
    await toast.getByText(/^(Board tidied|The board is already tidy)$/).waitFor();
  }, 60_000);
});

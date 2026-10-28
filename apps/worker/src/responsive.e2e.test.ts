/**
 * T13.6 end to end (D33): the workspace on a phone and a tablet. Phone: condensed top bar with a More menu,
 * library and inspector as bottom sheets, no Select / Hand tools (D58: one finger moves the board, a tap selects, a selected
 * panel moves under the finger, two fingers pinch and pan anywhere; Select several for taps and a box, then Group /
 * Delete), long-press for a menu, tap a port then a target to wire, the editor's Design panel as a sheet. Tablet: the panels are overlays, one at a time.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addSource, connectSource, deleteSource, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('responsive workspace (T13.6)', () => {
  let stack: Stack;
  let phone: Page;
  let url = '';
  let boardUrl = '';

  beforeAll(async () => {
    stack = await startStack();
    phone = await stack.env.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const ids = await setupAndCreateProject(phone, stack.env.webUrl, 'Phone');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    boardUrl = phone.url();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await phone.request.get(url)).json()).doc;
  const bar = (p: Page) => p.getByRole('toolbar', { name: 'Canvas tools' });

  it('phone: condensed top bar, More menu, no docked panels, Select tool', async () => {
    await bar(phone).waitFor();
    expect(await phone.getByRole('button', { name: '+ Add' }).count()).toBe(0);
    expect(await phone.getByRole('complementary', { name: 'Node library' }).count()).toBe(0);
    expect(await phone.getByRole('complementary', { name: 'Inspector' }).count()).toBe(0);
    // D58: Select several stands in for Select / Hand (one finger moves the board, a tap selects).
    expect(await bar(phone).getByRole('button', { name: 'Select several' }).getAttribute('aria-pressed')).toBe('false');
    expect(await bar(phone).getByRole('button', { name: /^(Select \(V\)|Hand)/ }).count()).toBe(0);
    expect(await phone.locator('.react-flow__minimap').count()).toBe(0);
    // D57: grid snap is on phones too, and the toolbar still fits the screen.
    expect(await bar(phone).getByRole('button', { name: 'Snap to grid' }).count()).toBe(1);
    const toolsBox = await bar(phone).boundingBox();
    expect((toolsBox?.x ?? -1) >= 0 && (toolsBox?.x ?? 0) + (toolsBox?.width ?? 0) <= 390).toBe(true);
    // The board fills exactly the visible height (dvh) and the page never scrolls, so the top bar and the
    // canvas toolbar both stay on screen — also when the browser's own bars shrink the visible area.
    for (const height of [844, 700]) {
      await phone.setViewportSize({ width: 390, height });
      await phone.waitForTimeout(200);
      const m = await phone.evaluate(() => {
        const board = document.querySelector('.sc-board')?.getBoundingClientRect();
        const top = document.querySelector('.sc-topbar')?.getBoundingClientRect();
        const tools = document.querySelector('.sc-canvasbar')?.getBoundingClientRect();
        return { inner: window.innerHeight, scroll: document.scrollingElement?.scrollHeight ?? 0, board: board?.height ?? 0, top: top?.top ?? -1, toolsBottom: tools?.bottom ?? 9999 };
      });
      expect(m.board).toBe(m.inner);
      expect(m.scroll).toBeLessThanOrEqual(m.inner);
      expect(m.top).toBeGreaterThanOrEqual(0);
      expect(m.toolsBottom).toBeLessThanOrEqual(m.inner);
    }
    await phone.setViewportSize({ width: 390, height: 844 });
    // UI audit: the top bar's end group (save, More, Export) sits at the right edge.
    const exportBox = await phone.getByRole('button', { name: 'Export' }).boundingBox();
    expect((exportBox?.x ?? 0) + (exportBox?.width ?? 0)).toBeGreaterThan(390 - 16);
    // ...as a 36 px icon button clear of the screen edge (it filled the bar's corner on a device).
    expect(exportBox?.width ?? 99).toBeLessThanOrEqual(36);
    expect(exportBox?.height ?? 99).toBeLessThanOrEqual(36);
    expect(390 - ((exportBox?.x ?? 0) + (exportBox?.width ?? 0))).toBeGreaterThanOrEqual(6);
    await phone.getByRole('button', { name: 'More' }).tap();
    const menu = phone.getByRole('menu', { name: 'More' });
    for (const item of [/^Undo/, 'Team fonts', 'Team library', /theme$/]) expect(await menu.getByRole('menuitem', { name: item }).count()).toBe(1);
    // D70: nodes are no longer in More; the bottom toolbar's Add opens them, in sections.
    expect(await menu.getByRole('menuitem', { name: 'Logo node' }).count()).toBe(0);
    const box = await menu.boundingBox();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
    await phone.keyboard.press('Escape');
    await bar(phone).getByRole('button', { name: 'Add', exact: true }).tap();
    const add = phone.getByRole('menu', { name: 'Add' });
    for (const item of ['Logo node', 'Text node', 'Image node']) expect(await add.getByRole('menuitem', { name: item }).count()).toBe(1);
    expect(await add.getByText('Asset nodes', { exact: true }).count()).toBe(1);
    expect(await add.getByText('Preset nodes of sizes', { exact: true }).count()).toBe(1);
    const addBox = await add.boundingBox();
    expect((addBox?.y ?? 0) + (addBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await phone.keyboard.press('Escape');
  }, 60_000);

  it('phone: the inspector is a bottom sheet (D49: no node library; D70: nodes are added from the toolbar\'s Add)', async () => {
    expect(await bar(phone).getByRole('button', { name: 'Add nodes' }).count()).toBe(0);
    await bar(phone).getByRole('button', { name: 'Inspector' }).tap();
    const sheet = await phone.getByRole('complementary', { name: 'Inspector' }).boundingBox();
    expect(Math.round(sheet?.width ?? 0)).toBe(390);
    await phone.getByRole('button', { name: 'Close inspector' }).tap();
    expect(await phone.getByRole('complementary', { name: 'Inspector' }).count()).toBe(0);
  }, 60_000);

  it('phone: tap a port, then tap a target, to wire', async () => {
    // A Background node not wired yet.
    const cur = (await (await phone.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const added = addSource(cur.doc, { id: 'bg2', kind: 'image', label: 'Background 2', behavesLike: 'background', board: { x: 1600, y: 0 } });
    if (!added.ok) throw new Error(added.error);
    expect((await phone.request.put(url, { data: { rev: cur.rev, doc: added.doc } })).status()).toBe(200);
    await phone.reload();
    await bar(phone).waitFor();
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    await phone.locator('.react-flow__node[data-id="src:bg2"] .react-flow__handle.source').tap();
    await phone.locator('.react-flow__node[data-id="main"] .react-flow__handle[data-handleid="layers"]').tap();
    await expect.poll(async () => (await doc()).edges.some((e) => e.kind === 'layer' && e.from === 'bg2' && e.to === 'main'), { timeout: 15_000 }).toBe(true);
  }, 60_000);

  /** The board's viewport transform (pan and zoom). */
  const viewport = () => phone.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport') as Element).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
  type Pt = { x: number; y: number };
  /** A scripted touch gesture: each finger goes from its start to its end in `steps` moves. */
  const touchDrag = async (fingers: { from: Pt; to: Pt }[], steps = 8) => {
    const cdp = await phone.context().newCDPSession(phone);
    const at = (i: number) => fingers.map((f, id) => ({ id, x: f.from.x + ((f.to.x - f.from.x) * i) / steps, y: f.from.y + ((f.to.y - f.from.y) * i) / steps }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    // (The first tap right after a scripted touch drag is taken as part of it: wait like a person would.)
    await phone.waitForTimeout(600);
  };
  const boxOf = async (sel: string) => {
    const b = await phone.locator(sel).first().boundingBox();
    if (!b) throw new Error(`no ${sel}`);
    return b;
  };
  const MAIN = '.react-flow__node[data-id="main"]';
  /**
   * A point where a finger grabs the panel itself: preferably with no port, button or other control within a finger's
   * reach (Chrome moves a touch onto a control close to it), else a plain spot on its title.
   */
  const grabPoint = (node: string, clearOnly = false) => phone.evaluate(({ sel, clearOnly }) => {
    const panel = document.querySelector(sel);
    const box = panel?.getBoundingClientRect();
    const title = panel?.querySelector('.sc-node__title')?.getBoundingClientRect();
    if (!panel || !box || !title) throw new Error(`no ${sel}`);
    const plain = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && hit.closest('.react-flow__node') === panel && !hit.closest('.react-flow__handle, button, input, textarea, label, a, [draggable="true"], .nodrag');
    };
    for (let y = box.y + 6; y < box.bottom - 6; y += 4)
      for (let x = box.x + 6; x < box.right - 6; x += 4) if (([[0, 0], [-10, 0], [10, 0], [0, -10], [0, 10]] as const).every(([dx, dy]) => plain(x + dx, y + dy))) return { x, y };
    if (!clearOnly) for (let fx = 0.1; fx < 1; fx += 0.1) if (plain(title.x + title.width * fx, title.y + title.height / 2)) return { x: title.x + title.width * fx, y: title.y + title.height / 2 };
    throw new Error(`no grab point on ${sel}`);
  }, { sel: node, clearOnly });
  /** A grab point on the first of the panels `sel` matches that has one, a clear one if any panel has it. */
  const grabAny = async (sel: string) => {
    const ids = await phone.locator(sel).evaluateAll((ns) => ns.map((n) => n.getAttribute('data-id') ?? ''));
    for (const clearOnly of [true, false])
      for (const id of ids) {
        const p = await grabPoint(`.react-flow__node[data-id="${id}"]`, clearOnly).catch(() => undefined);
        if (p) return p;
      }
    throw new Error(`no grab point on ${sel}`);
  };

  it('phone (D58): one finger on empty canvas moves the board and selects nothing', async () => {
    // The far-off Background 2 from the wiring test would make Fit zoom out until panels are a few px tall.
    const cur = (await (await phone.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const gone = deleteSource(cur.doc, 'bg2');
    if (gone.ok) {
      expect((await phone.request.put(url, { data: { rev: cur.rev, doc: gone.doc } })).status()).toBe(200);
      await phone.reload();
      await bar(phone).waitFor();
    }
    await phone.keyboard.press('Escape');
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const pane = await boxOf('.react-flow__pane');
    const from = { x: pane.x + 20, y: pane.y + pane.height - 120 };
    expect(await phone.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane'), from)).toBe(true);
    const v0 = await viewport();
    await touchDrag([{ from, to: { x: from.x + 120, y: from.y - 80 } }]);
    const v1 = await viewport();
    expect(Math.round(v1.x - v0.x)).toBe(120);
    expect(Math.round(v1.y - v0.y)).toBe(-80);
    expect(await phone.locator('.react-flow__node.selected').count()).toBe(0);
    // A finger that starts on a card's button moves the board too (and doesn't press it).
    const edit = await boxOf(`${MAIN} button`);
    const onButton = { x: edit.x + edit.width / 2, y: edit.y + edit.height / 2 };
    await touchDrag([{ from: onButton, to: { x: onButton.x - 50, y: onButton.y + 40 } }]);
    const v2 = await viewport();
    expect(Math.round(v2.x - v1.x)).toBe(-50);
    expect(await phone.getByRole('dialog').count()).toBe(0);
    // Double-tap on empty canvas zooms in a step.
    const cdp = await phone.context().newCDPSession(phone);
    const empty = { x: pane.x + 20, y: pane.y + pane.height - 120 };
    for (let i = 0; i < 2; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [empty] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phone.waitForTimeout(80);
    }
    await cdp.detach();
    await expect.poll(async () => (await viewport()).zoom / v2.zoom).toBeGreaterThan(1.5);
  }, 60_000);

  it('phone (D58): a finger on a panel not selected moves the board, not the panel; tap it, then the drag moves it', async () => {
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const board0 = (await doc()).compositions.find((c) => c.id === 'main')?.board;
    const from = await grabPoint(MAIN);
    const v0 = await viewport();
    await touchDrag([{ from, to: { x: from.x + 60, y: from.y + 50 } }]);
    const vPan = await viewport();
    expect(Math.round(vPan.x - v0.x)).toBe(60);
    expect((await doc()).compositions.find((c) => c.id === 'main')?.board).toEqual(board0);
    // Tap selects it (zoomed out, Q8: and zooms to it); now the same drag moves the panel (and saves it), not the board.
    const tapAt = await grabPoint(MAIN);
    await phone.touchscreen.tap(tapAt.x, tapAt.y);
    await expect.poll(() => phone.locator(`${MAIN}.selected`).count()).toBe(1);
    await phone.waitForTimeout(600);
    const v1 = await viewport();
    const on = await grabPoint(MAIN);
    // (A finger reports small steps; the panel follows once it has moved past the few px a tap may wobble.)
    await touchDrag([{ from: on, to: { x: on.x + 60, y: on.y + 50 } }], 30);
    // The board stays put (it may auto-pan a few px if the panel nears the edge), the panel follows the finger.
    const after = await viewport();
    expect(Math.abs(after.x - v1.x) + Math.abs(after.y - v1.y)).toBeLessThan(10);
    await expect.poll(async () => {
      const now = (await doc()).compositions.find((c) => c.id === 'main')?.board;
      // About under the finger (the alignment guides may pull it a few px onto another panel's edge).
      return now && board0 ? Math.abs((now.x - board0.x) * v1.zoom - 60) <= 16 && Math.abs((now.y - board0.y) * v1.zoom - 50) <= 16 : false;
    }, { timeout: 15_000 }).toBe(true);
    await phone.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await doc()).compositions.find((c) => c.id === 'main')?.board, { timeout: 15_000 }).toEqual(board0);
  }, 60_000);

  it('phone (D58): two fingers pinch-zoom and pan, also with both fingers on a panel and its buttons', async () => {
    await phone.keyboard.press('Escape');
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const pane = await boxOf('.react-flow__pane');
    // Both fingers on the Main Comps panel, one on its Edit button.
    const panel = await boxOf(MAIN);
    const edit = await boxOf(`${MAIN} button`);
    const c = { x: Math.min(panel.x + panel.width / 2, pane.x + pane.width - 60), y: Math.min(panel.y + panel.height / 2, pane.y + pane.height - 60) };
    const f1 = { x: edit.x + edit.width / 2, y: edit.y + edit.height / 2 };
    const f2 = { x: 2 * c.x - f1.x, y: 2 * c.y - f1.y };
    const v0 = await viewport();
    // Spread to twice the distance about the same midpoint.
    await touchDrag([{ from: f1, to: { x: 2 * f1.x - c.x, y: 2 * f1.y - c.y } }, { from: f2, to: { x: 2 * f2.x - c.x, y: 2 * f2.y - c.y } }]);
    const v1 = await viewport();
    expect(v1.zoom / v0.zoom).toBeGreaterThan(1.8);
    expect(await phone.getByRole('dialog').count()).toBe(0); // the Edit button wasn't pressed
    expect(await phone.locator('.react-flow__node.selected').count()).toBe(0);
    // Two fingers moving together pan.
    await touchDrag([{ from: { x: c.x - 30, y: c.y }, to: { x: c.x - 30, y: c.y + 90 } }, { from: { x: c.x + 30, y: c.y }, to: { x: c.x + 30, y: c.y + 90 } }]);
    const v2 = await viewport();
    expect(Math.round(v2.y - v1.y)).toBe(90);
    expect(v2.zoom).toBeCloseTo(v1.zoom, 3);
  }, 60_000);

  it('phone (D58, Q8): zoomed out, a tap on a panel zooms to it and selects it, and presses nothing inside it', async () => {
    await phone.keyboard.press('Escape');
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(500);
    expect((await viewport()).zoom).toBeLessThan(0.5);
    const before = JSON.stringify((await doc()).sources);
    // The logo panel's title, where a finger at this zoom used to land on an item's remove button.
    const t = await boxOf('.react-flow__node[data-id^="stk:"] .sc-node__title');
    await phone.touchscreen.tap(t.x + Math.min(30, t.width / 2), t.y + t.height / 2);
    await expect.poll(async () => (await viewport()).zoom, { timeout: 10_000 }).toBeGreaterThan(0.5);
    await expect.poll(() => phone.locator('.react-flow__node[data-id^="stk:"].selected').count()).toBe(1);
    expect(JSON.stringify((await doc()).sources)).toBe(before);
    expect(await phone.getByRole('dialog').count()).toBe(0);
    await phone.keyboard.press('Escape');
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(500);
  }, 60_000);

  it('phone (D58): Select several — taps add panels, a drag on empty canvas draws a box, Group, Done; a long press on a tool shows its tooltip', async () => {
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    await phone.keyboard.press('Escape');
    const several = bar(phone).getByRole('button', { name: 'Select several' });
    await several.tap();
    expect(await several.getAttribute('aria-pressed')).toBe('true');
    const selbar = phone.getByRole('toolbar', { name: 'Selection' });
    await selbar.getByText('0 selected').waitFor();
    // A box around the top row's first two asset nodes, from empty canvas below-right of them (a touch close to a
    // panel is moved onto it by the browser), up-left past their corner.
    const boxes = await phone.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.react-flow__node')].map((n) => ({ id: n.dataset.id ?? '', ...n.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number } })),
    );
    const row = boxes.filter((b) => b.id.startsWith('stk:') || b.id.startsWith('hl:')).sort((a, b) => a.x - b.x).slice(0, 2);
    if (row.length < 2) throw new Error('no asset row');
    const from = { x: Math.max(...row.map((b) => b.x + b.width)) + 4, y: Math.max(...row.map((b) => b.y + b.height)) + 40 };
    const to = { x: Math.min(...row.map((b) => b.x)) - 2, y: Math.min(...row.map((b) => b.y)) - 2 };
    expect(await phone.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane'), from)).toBe(true);
    const v0 = await viewport();
    await touchDrag([{ from, to }]);
    expect(await selbar.getByText(/^\d+ selected$/).innerText()).toMatch(/^[2-9] selected$/);
    // A box, not a pan: the board didn't follow the finger left (it may auto-pan a little as the box nears the edge).
    expect((await viewport()).x - v0.x).toBeGreaterThan(-20);
    await selbar.getByRole('button', { name: 'Clear selection' }).tap();
    await selbar.getByText('0 selected').waitFor();
    await phone.waitForTimeout(600);
    // Taps add panels (and a second tap takes one out again).
    const first = await grabAny('.react-flow__node:not([data-id="main"]):not([data-id^="grp:"])');
    await phone.touchscreen.tap(first.x, first.y);
    await selbar.getByText('1 selected').waitFor();
    await phone.waitForTimeout(400);
    const main = await grabPoint(MAIN);
    await phone.touchscreen.tap(main.x, main.y);
    await selbar.getByText('2 selected').waitFor();
    await phone.waitForTimeout(400);
    await phone.touchscreen.tap(main.x, main.y);
    await selbar.getByText('1 selected').waitFor();
    await phone.waitForTimeout(400);
    await phone.touchscreen.tap(main.x, main.y);
    await selbar.getByText('2 selected').waitFor();
    await phone.waitForTimeout(400);
    await selbar.getByRole('button', { name: 'Group' }).tap();
    await expect.poll(async () => (await doc()).groups?.length, { timeout: 15_000 }).toBe(1);
    // Done leaves Select several: the bar goes, one finger moves the board again.
    await selbar.getByRole('button', { name: 'Done' }).tap();
    await phone.keyboard.press('Escape');
    await selbar.waitFor({ state: 'detached' });
    expect(await several.getAttribute('aria-pressed')).toBe('false');
    // A long press on a tool shows its tooltip and doesn't press it.
    const cdp = await phone.context().newCDPSession(phone);
    const sb = await several.boundingBox();
    if (!sb) throw new Error('no Select several button');
    const at = [{ x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
    await phone.waitForTimeout(700);
    expect(await phone.locator('.sc-tip--show').innerText()).toContain('Tap panels to add or take them out');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await several.getAttribute('aria-pressed')).toBe('false');
  }, 60_000);

  it('phone: long-press on the canvas opens the canvas menu', async () => {
    const several = bar(phone).getByRole('button', { name: 'Select several' });
    if ((await several.getAttribute('aria-pressed')) === 'true') await several.tap();
    await phone.waitForTimeout(600);
    const pane = await phone.locator('.react-flow__pane').boundingBox();
    if (!pane) throw new Error('no pane');
    const cdp = await phone.context().newCDPSession(phone);
    const at = [{ x: pane.x + 30, y: pane.y + 30 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
    await phone.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.getByRole('menu').waitFor();
    expect(await phone.getByRole('menu').count()).toBe(1);
    expect(await phone.getByRole('menuitem', { name: /Text/ }).count()).toBeGreaterThan(0);
    await phone.keyboard.press('Escape');
  }, 60_000);

  it('phone (D58): a long-press on a panel opens its menu', async () => {
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const cdp = await phone.context().newCDPSession(phone);
    // An input panel such as the Background (those have a panel menu).
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await grabAny('.react-flow__node[data-id^="src:"]')] });
    await phone.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.getByRole('menu').waitFor();
    for (const item of ['Duplicate', 'Delete']) expect(await phone.getByRole('menu').getByRole('menuitem', { name: item }).count()).toBe(1);
    expect(await phone.locator('.react-flow__node.selected').count()).toBe(0); // a menu, not a selection
    await phone.keyboard.press('Escape');
    await phone.getByRole('menu').waitFor({ state: 'detached' });
  }, 60_000);

  it('phone: editors show the canvas with the Design panel as a sheet', async () => {
    // A wired layer to select in the editor.
    const cur = (await (await phone.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    // D49: only the background wired, so a tap on the canvas lands on it.
    const wired = connectSource({ ...cur.doc, edges: cur.doc.edges.filter((e) => e.kind !== 'layer' || e.from === 'background') }, 'background');
    if (!wired.ok) throw new Error(wired.error);
    expect((await phone.request.put(url, { data: { rev: cur.rev, doc: wired.doc } })).status()).toBe(200);
    await phone.reload();
    await bar(phone).waitFor();
    // D70: a phone opens on the first asset nodes, readable; Fit to screen shows the whole board.
    await expect.poll(async () => (await viewport()).zoom, { timeout: 10_000 }).toBeGreaterThan(0.4);
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(500);
    // Zoomed out (Q8), the first tap zooms to the panel; then Edit takes the tap.
    const edit = phone.locator('.react-flow__node[data-id="main"]').getByRole('button', { name: /^Edit/ }).first();
    await edit.tap();
    await phone.waitForTimeout(500);
    if (!(await phone.getByRole('complementary', { name: 'Design' }).count())) await edit.tap();
    const design = phone.getByRole('complementary', { name: 'Design' });
    await design.waitFor();
    expect(await phone.getByRole('complementary', { name: 'Layers' }).isVisible()).toBe(false);
    const box = await design.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390);
    expect((box?.height ?? 900) <= 844 * 0.45 + 1).toBe(true);
    // UI audit: the editor bar is one line that never scrolls sideways; touch gets gestures, not shortcuts.
    const figBar = await phone.locator('.sc-fig__bar').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }));
    expect(figBar.sw).toBeLessThanOrEqual(figBar.cw);
    const title = await phone.locator('.sc-fig__title strong').boundingBox();
    expect(title?.height ?? 99).toBeLessThan(24);
    expect(await design.getByText('Gestures').isVisible()).toBe(true);
    // V3: folded until wanted; one gesture per line.
    await design.getByText('Gestures').tap();
    await design.getByText('Move the canvas').waitFor();
    if (process.env.SC_SHOTS) await phone.screenshot({ path: `${process.env.SC_SHOTS}/phone-editor-gestures.png` });
    await design.getByText('Gestures').tap();
    expect(await design.getByText('Shortcuts').isVisible()).toBe(false);
    // V3: the sheet's Layers tab lists every layer on a phone; Design comes back with its tab.
    const tabs = phone.getByRole('tablist', { name: 'Panels' });
    await tabs.getByRole('tab', { name: 'Layers' }).tap();
    const layersSheet = phone.getByRole('complementary', { name: 'Layers' });
    await expect.poll(() => layersSheet.isVisible()).toBe(true);
    expect(await design.isVisible()).toBe(false);
    expect(await layersSheet.locator('[data-layer]').count()).toBeGreaterThan(0);
    if (process.env.SC_SHOTS) await phone.screenshot({ path: `${process.env.SC_SHOTS}/phone-editor-layers.png` });
    await tabs.getByRole('tab', { name: 'Design' }).tap();
    await design.waitFor();
    if (process.env.SC_SHOTS) await phone.screenshot({ path: `${process.env.SC_SHOTS}/phone-editor-design.png` });
    // Select a layer: whole-px values; tapping a field and leaving it changes nothing (no write, no undo step).
    await phone.locator('.sc-editor__canvas [data-source-id="background"]').tap();
    const x = design.getByLabel('X', { exact: true });
    await x.waitFor();
    expect(await x.inputValue()).toMatch(/^-?\d+$/);
    const before = await (await phone.request.get(url)).json();
    await x.tap();
    await design.getByText(/·/).first().tap();
    await phone.waitForTimeout(1500);
    expect((await (await phone.request.get(url)).json()).rev).toBe(before.rev);
    await phone.keyboard.press('Escape');
  }, 60_000);

  it('phone: tap a wire, then Disconnect, to take it off (no Delete key on touch)', async () => {
    await phone.reload();
    await bar(phone).waitFor();
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const wire = phone.locator('.react-flow__edge[data-id="in:background"]');
    // A point on the (curved) wire, a third of the way along.
    const at = await wire.locator('path.react-flow__edge-path').evaluate((el) => {
      const path = el as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 3);
      const m = path.getScreenCTM();
      return m ? { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f } : null;
    });
    if (!at) throw new Error('no wire');
    await phone.touchscreen.tap(at.x, at.y);
    await phone.getByRole('button', { name: 'Disconnect wire' }).tap();
    await expect.poll(async () => (await (await phone.request.get(url)).json()).doc.edges.some((e: { id: string }) => e.id === 'in:background')).toBe(false);
    expect(await phone.getByRole('button', { name: 'Disconnect wire' }).count()).toBe(0);
  }, 60_000);

  it('phone: projects home, Size presets and Team fit the screen (no sideways scroll)', async () => {
    const shot = async (name: string) => process.env.SC_SHOTS && (await phone.screenshot({ path: `${process.env.SC_SHOTS}/${name}.png` }));
    /** Nothing in the page or the open dialog reaches past the right edge. */
    const fits = () =>
      phone.evaluate(() => {
        const box = document.querySelector('dialog[open] .sc-card') ?? document.documentElement;
        const right = Math.min(window.innerWidth, box.getBoundingClientRect().right);
        const over = [...box.querySelectorAll('input, select, button, h1, h2')].filter((el) => el.getBoundingClientRect().right > right + 0.5);
        return { scroll: document.documentElement.scrollWidth - window.innerWidth, inner: box.scrollWidth - box.clientWidth, over: over.map((el) => el.outerHTML.slice(0, 60)) };
      });
    await phone.goto(stack.env.webUrl);
    await phone.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    // One-line rows: a short relative date, not a full timestamp.
    expect(await phone.locator('[data-project="Phone"] .sc-rows__meta').innerText()).toMatch(/^Edited (just now|\d+ min ago)$/);
    expect(await fits()).toEqual({ scroll: 0, inner: 0, over: [] });
    await shot('home');

    await phone.getByRole('button', { name: 'Size presets' }).click();
    const presets = phone.getByRole('dialog');
    await presets.getByRole('form', { name: 'New preset' }).waitFor();
    await presets.getByRole('form', { name: 'New preset' }).scrollIntoViewIfNeeded();
    expect(await fits()).toEqual({ scroll: 0, inner: 0, over: [] });
    await shot('presets');
    await presets.getByRole('button', { name: 'Close' }).click();

    await phone.getByRole('button', { name: 'Team' }).click();
    const team = phone.getByRole('dialog');
    await team.getByRole('form', { name: 'Invite' }).getByRole('button', { name: 'Create invite link' }).click();
    await team.getByLabel('Invite link', { exact: true }).waitFor();
    expect(await fits()).toEqual({ scroll: 0, inner: 0, over: [] });
    await shot('team');
    await team.getByRole('button', { name: 'Close' }).click();
    await phone.goto(boardUrl);
  }, 60_000);

  it('tablet: the full top bar; the inspector is an overlay over the canvas', async () => {
    const tablet = await stack.env.browser.newPage({ viewport: { width: 1024, height: 768 } });
    await tablet.context().addCookies(await phone.context().cookies());
    await tablet.goto(boardUrl);
    await bar(tablet).waitFor();
    expect(await tablet.getByRole('button', { name: '+ Add' }).count()).toBe(1); // full top bar
    const pane = await tablet.locator('.react-flow__pane').boundingBox();
    await bar(tablet).getByRole('button', { name: 'Inspector' }).click();
    await tablet.getByRole('complementary', { name: 'Inspector' }).waitFor();
    expect(Math.round((await tablet.locator('.react-flow__pane').boundingBox())?.width ?? 0)).toBe(Math.round(pane?.width ?? -1)); // over the canvas, not beside it
    await tablet.close();
  }, 60_000);
});

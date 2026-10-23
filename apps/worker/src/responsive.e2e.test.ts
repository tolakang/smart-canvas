/**
 * T13.6 end to end (D33): the workspace on a phone and a tablet. Phone: condensed top bar with a More menu,
 * library and inspector as bottom sheets, the Select tool by default (a finger drag on empty canvas selects several
 * panels, then Group / Delete), long-press for the canvas menu, tap a port then a target to wire, the editor's Design panel as a sheet. Tablet: the panels are overlays, one at a time.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addSource, connectSource, type ProjectDoc } from '@smart-canvas/core';
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
    expect(await bar(phone).getByRole('button', { name: 'Select (V)' }).getAttribute('aria-pressed')).toBe('true');
    expect(await phone.locator('.react-flow__minimap').count()).toBe(0);
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
    for (const item of [/^Undo/, 'Logo node', 'Text node', 'Image node', 'Team fonts', 'Team library', /theme$/]) expect(await menu.getByRole('menuitem', { name: item }).count()).toBe(1);
    const box = await menu.boundingBox();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
    await phone.keyboard.press('Escape');
  }, 60_000);

  it('phone: the inspector is a bottom sheet (D49: no node library; nodes are added from More)', async () => {
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

  it('phone: a finger drag on empty canvas draws a selection box; two panels selected show Group / Delete; a long press on a tool shows its tooltip', async () => {
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    // A box around the top row's first two asset nodes, from empty canvas above-left of them.
    const boxes = await phone.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.react-flow__node')].map((n) => ({ id: n.dataset.id ?? '', ...n.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number } })),
    );
    const row = boxes.filter((b) => b.id.startsWith('stk:') || b.id.startsWith('hl:')).sort((a, b) => a.x - b.x).slice(0, 2);
    if (row.length < 2) throw new Error('no asset row');
    // From empty canvas below-right of them (a touch close to a panel is moved onto it by the browser), up-left
    // past their corner.
    const from = { x: Math.max(...row.map((b) => b.x + b.width)) + 4, y: Math.max(...row.map((b) => b.y + b.height)) + 40 };
    const to = { x: Math.min(...row.map((b) => b.x)) - 2, y: Math.min(...row.map((b) => b.y)) - 2 };
    expect(await phone.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane'), from)).toBe(true);
    const cdp = await phone.context().newCDPSession(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const selbar = phone.getByRole('toolbar', { name: 'Selection' });
    await selbar.waitFor();
    expect(await selbar.getByText(/^\d+ selected$/).innerText()).toMatch(/^[2-9] selected$/);
    // (The first tap right after a scripted touch drag is taken as part of it: wait like a person would.)
    await phone.waitForTimeout(600);
    await selbar.getByRole('button', { name: 'Group' }).tap();
    await expect.poll(async () => (await doc()).groups?.length, { timeout: 15_000 }).toBe(1);
    await selbar.getByRole('button', { name: 'Clear selection' }).tap();
    await selbar.waitFor({ state: 'detached' });
    // A long press on a tool shows its tooltip and doesn't press it.
    const hand = bar(phone).getByRole('button', { name: /^Hand/ });
    const hb = await hand.boundingBox();
    if (!hb) throw new Error('no hand button');
    const at = [{ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
    await phone.waitForTimeout(700);
    expect(await phone.locator('.sc-tip--show').innerText()).toContain('Drag anywhere to move the board');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await hand.getAttribute('aria-pressed')).toBe('false');
  }, 60_000);

  it('phone: long-press on the canvas opens the canvas menu', async () => {
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

  it('phone: a long-press on a panel adds it to the selection, and again takes it out (D57)', async () => {
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    const cdp = await phone.context().newCDPSession(phone);
    const hold = async (sel: string) => {
      const b = await phone.locator(sel).first().boundingBox();
      if (!b) throw new Error(`no ${sel}`);
      const at = [{ x: b.x + Math.min(30, b.width / 2), y: b.y + b.height / 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
      await phone.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phone.waitForTimeout(600);
    };
    await phone.locator('.react-flow__node-mainNode .sc-node__title').first().tap();
    await expect.poll(() => phone.locator('.react-flow__node.selected').count()).toBe(1);
    const other = '.react-flow__node[data-id^="stk:"] .sc-node__title';
    await hold(other);
    const selbar = phone.getByRole('toolbar', { name: 'Selection' });
    await selbar.getByText('2 selected').waitFor();
    expect(await phone.getByRole('menu').count()).toBe(0); // a selection toggle, not a menu
    await hold(other);
    await selbar.waitFor({ state: 'detached' });
    expect(await phone.locator('.react-flow__node.selected').count()).toBe(1);
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
    await phone.locator('.react-flow__node[data-id="main"]').getByRole('button', { name: /^Edit/ }).first().tap();
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
    expect(await design.getByText('Shortcuts').isVisible()).toBe(false);
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

/**
 * T13.6 end to end (D33): the workspace on a phone and a tablet. Phone: condensed top bar with a More menu,
 * library and inspector as bottom sheets, Hand tool by default, long-press for the canvas menu, tap a port then a
 * target to wire, the editor's Design panel as a sheet. Tablet: the panels are overlays, one at a time.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { connectSource, type ProjectDoc } from '@smart-canvas/core';
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
  const saved = (p: Page) => p.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('phone: condensed top bar, More menu, no docked panels, Hand tool', async () => {
    await bar(phone).waitFor();
    expect(await phone.getByRole('button', { name: '+ Add input' }).count()).toBe(0);
    expect(await phone.getByRole('complementary', { name: 'Node library' }).count()).toBe(0);
    expect(await phone.getByRole('complementary', { name: 'Inspector' }).count()).toBe(0);
    expect(await bar(phone).getByRole('button', { name: /^Hand/ }).getAttribute('aria-pressed')).toBe('true');
    expect(await phone.locator('.react-flow__minimap').count()).toBe(0);
    // UI audit: the top bar's end group (save, More, Export) sits at the right edge.
    const exportBox = await phone.getByRole('button', { name: 'Export' }).boundingBox();
    expect((exportBox?.x ?? 0) + (exportBox?.width ?? 0)).toBeGreaterThan(390 - 16);
    await phone.getByRole('button', { name: 'More' }).tap();
    const menu = phone.getByRole('menu', { name: 'More' });
    for (const item of [/^Undo/, /^Add input/, /^Add output/, 'Team fonts', 'Team library', /theme$/]) expect(await menu.getByRole('menuitem', { name: item }).count()).toBe(1);
    const box = await menu.boundingBox();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
    await phone.keyboard.press('Escape');
  }, 60_000);

  it('phone: library and inspector are bottom sheets; tapping an item adds it and closes the sheet', async () => {
    await bar(phone).getByRole('button', { name: 'Add nodes' }).tap();
    const lib = phone.getByRole('complementary', { name: 'Node library' });
    await lib.waitFor();
    const sheet = await lib.boundingBox();
    expect(Math.round((sheet?.y ?? 0) + (sheet?.height ?? 0))).toBe(844); // docked to the bottom
    expect(Math.round(sheet?.width ?? 0)).toBe(390);
    const before = (await doc()).sources.length;
    await lib.getByRole('button', { name: /^Text(?! variant)/ }).tap();
    await saved(phone);
    expect((await doc()).sources.length).toBe(before + 1);
    expect(await lib.count()).toBe(0);
    await bar(phone).getByRole('button', { name: 'Inspector' }).tap();
    await phone.getByRole('button', { name: 'Close inspector' }).tap();
    expect(await phone.getByRole('complementary', { name: 'Inspector' }).count()).toBe(0);
  }, 60_000);

  it('phone: tap a port, then tap a target, to wire', async () => {
    await bar(phone).getByRole('button', { name: 'Add nodes' }).tap();
    await phone.getByRole('complementary', { name: 'Node library' }).getByRole('button', { name: /^Main preview/ }).tap();
    await saved(phone);
    const comp = (await doc()).compositions[1];
    const source = (await doc()).sources[0];
    if (!comp || !source) throw new Error('no composition');
    await bar(phone).getByRole('button', { name: /^Fit to screen/ }).tap();
    await phone.waitForTimeout(400);
    await phone.locator(`.react-flow__node[data-id="src:${source.id}"] .react-flow__handle.source`).tap();
    await phone.locator(`.react-flow__node[data-id="comp:${comp.id}"] .sc-port--add .react-flow__handle`).tap();
    await expect.poll(async () => (await doc()).edges.some((e) => e.kind === 'layer' && e.from === source.id && e.to === comp.id), { timeout: 15_000 }).toBe(true);
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

  it('phone: editors show the canvas with the Design panel as a sheet', async () => {
    // A wired layer to select in the editor.
    const cur = (await (await phone.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const wired = connectSource(cur.doc, 'background');
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

  it('tablet: library and inspector are overlays, one at a time', async () => {
    const tablet = await stack.env.browser.newPage({ viewport: { width: 1024, height: 768 } });
    await tablet.context().addCookies(await phone.context().cookies());
    await tablet.goto(boardUrl);
    await bar(tablet).waitFor();
    expect(await tablet.getByRole('button', { name: '+ Add input' }).count()).toBe(1); // full top bar
    expect(await tablet.getByRole('complementary', { name: 'Node library' }).count()).toBe(0);
    const pane = await tablet.locator('.react-flow__pane').boundingBox();
    await bar(tablet).getByRole('button', { name: 'Add nodes' }).click();
    await tablet.getByRole('complementary', { name: 'Node library' }).waitFor();
    expect(Math.round((await tablet.locator('.react-flow__pane').boundingBox())?.width ?? 0)).toBe(Math.round(pane?.width ?? -1)); // over the canvas, not beside it
    await bar(tablet).getByRole('button', { name: 'Inspector' }).click();
    await tablet.getByRole('complementary', { name: 'Inspector' }).waitFor();
    expect(await tablet.getByRole('complementary', { name: 'Node library' }).count()).toBe(0);
    await tablet.close();
  }, 60_000);
});

/**
 * CSS parity (P28, TAILWIND-PLAN.md): the board (asset nodes, top bar, menus, side panels, inspector, canvas). Each
 * screen is drawn with this branch's CSS and with main's, and every computed style and pixel must match. Runs on its
 * own stack and seeded project (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { cssParity, referenceCss, STRAY } from './test/css-parity';
import { limit, paritySuite } from './test/parity-suite';

describe.skipIf(!adminUrl)('CSS parity: the board: asset nodes, top bar, menus, side panels, inspector, canvas', () => {
  const { s, same, saved, node, imagesLoaded, fit, seed } = paritySuite();
  let page: Page;
  beforeAll(async () => {
    page = s.page;
    await seed();
  }, limit(180_000));

  it('the check itself: a one-rule change to the reference is caught', async () => {
    const r = await cssParity(page, 'self-check', `${referenceCss()}\nbody * { outline: 1px solid red; }`);
    expect(r.styles.some((d) => d.includes(':: outline-style'))).toBe(true);
    expect(r.pixels).toBeGreaterThan(STRAY);
  }, limit(60_000));

  it('board: every asset node with pictures and text, Previews in each group', async () => {
    await same('board');
  }, limit(60_000));

  it('board states: a slot hovered, a node selected with its inspector, a wire selected', async () => {
    await node('Image').locator('.sc-slot__pick img').first().hover();
    await same('slot-hover');
    await node('Image').locator('.sc-slot__pick img').first().click();
    await page.mouse.move(5, 500);
    await same('node-selected');
    await page.locator('.react-flow__edge').first().click({ force: true });
    await same('wire-selected');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('top bar: hovered buttons, keyboard focus, a hovered menu item', async () => {
    for (const [name, screen] of [
      ['History', 'topbar-hover-icon'],
      ['+ Add', 'topbar-hover-add'],
      ['Export', 'topbar-hover-export'],
    ] as const) {
      await page.getByRole('button', { name, exact: true }).hover();
      await same(screen);
    }
    await page.getByRole('button', { name: /Assets/ }).hover();
    await same('topbar-hover-ghost');
    await page.getByRole('button', { name: 'Back to projects' }).focus();
    await page.keyboard.press('Tab'); // focus-visible comes with the keyboard
    await same('topbar-focus');
    await page.mouse.move(5, 500);
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menu').getByRole('menuitem').first().hover();
    await same('menu-item-hover');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('menus: + Add and the canvas right-click menu', async () => {
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menu').waitFor();
    await same('add-menu');
    await page.keyboard.press('Escape');
    const pane = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.click((pane?.x ?? 0) + 30, (pane?.y ?? 0) + (pane?.height ?? 0) - 30, { button: 'right' });
    await page.getByRole('menu').waitFor();
    await same('context-menu');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('side panels: History and Review', async () => {
    await page.getByRole('button', { name: 'History' }).click();
    await page.waitForTimeout(500);
    await same('history');
    await page.getByRole('button', { name: 'History' }).first().click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('complementary', { name: 'Review' }).waitFor();
    await same('review');
    await page.getByRole('complementary', { name: 'Review' }).getByRole('button', { name: /^Open / }).first().hover();
    await same('review-row-hover');
    await page.mouse.move(5, 500);
    await page.getByRole('button', { name: 'Review', exact: true }).click();
  }, limit(60_000));

  it('inspector and canvas notices: a focused field, a Preview, the Tidy notice, a version shown', async () => {
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await node('Text').locator('.sc-node__title').click();
    await inspector.getByRole('textbox').first().focus();
    await same('inspector-field-focus');
    await page.locator('.react-flow__node[data-id="out:banner"] .sc-node__title').click();
    await page.mouse.move(5, 500);
    await same('inspector-preview');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tidy board' }).click();
    const toast = page.locator('.sc-board__toast');
    await toast.waitFor();
    await toast.getByRole('button', { name: 'Undo' }).hover();
    await page.waitForTimeout(400); // the panels glide into place; the notice stays 5 s, long enough for one draw
    await same('tidy-notice-hover');
    await saved();
    await page.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('complementary', { name: 'History' });
    await history.getByRole('textbox', { name: 'Version name' }).fill('Sent to client');
    await history.getByRole('button', { name: 'Save version' }).click();
    await history.getByRole('button', { name: /Sent to client/ }).first().hover();
    await same('history-item-hover');
    await history.getByRole('button', { name: /Sent to client/ }).first().click();
    await page.locator('.sc-board__version').waitFor();
    await page.waitForTimeout(500);
    await same('version-shown');
    await page.locator('.sc-board__version').getByRole('button', { name: 'Close' }).click();
    await page.locator('.sc-board__version').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Close history' }).click();
    await page.mouse.move(5, 500);
  }, limit(90_000));

  it('canvas: toolbar tips and focus, selection bar, a group, wire hover and reroute, zoomed-out name tags', async () => {
    const bar = page.getByRole('toolbar', { name: 'Canvas tools' });
    for (const [name, screen] of [
      ['Select (V)', 'canvas-tip-first'],
      ['Fit to screen (Shift+1)', 'canvas-tip'],
      ['Minimap', 'canvas-tip-last'],
    ] as const) {
      await bar.getByRole('button', { name, exact: true }).hover();
      await page.locator('.sc-tip--show').waitFor();
      await page.waitForTimeout(300); // the tip's fade-in
      await same(screen);
    }
    await page.mouse.move(5, 500);
    await bar.getByRole('button', { name: 'Select (V)', exact: true }).focus();
    await page.keyboard.press('Tab'); // focus-visible comes with the keyboard
    await page.waitForTimeout(300);
    await same('canvas-focus');
    await page.keyboard.press('Escape');

    await node('Text').locator('.sc-node__title').click();
    await node('Logo').locator('.sc-node__title').click({ modifiers: ['Shift'] });
    const selection = page.getByRole('toolbar', { name: 'Selection' });
    await selection.waitFor();
    await page.mouse.move(5, 500);
    await same('selection-bar');
    await selection.getByRole('button', { name: 'Group' }).click();
    const group = page.locator('.sc-group');
    await group.waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.move(5, 500);
    await same('group');
    await group.locator('.sc-group__title').click();
    await page.mouse.move(5, 500);
    await same('group-selected');
    await page.getByRole('button', { name: /^Collapse group/ }).click();
    await page.mouse.move(5, 500);
    await same('group-collapsed');
    await page.getByRole('button', { name: /^Ungroup/ }).click();
    await group.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await saved();

    // A wire hovered (its ✂ badge), then a reroute point on it.
    const wire = await page.locator('.react-flow__edge').first().boundingBox();
    const mid = { x: (wire?.x ?? 0) + (wire?.width ?? 0) / 2, y: (wire?.y ?? 0) + (wire?.height ?? 0) / 2 };
    await page.mouse.move(mid.x, mid.y);
    await page.locator('.sc-wire-cut--hover').waitFor();
    await same('wire-hover');
    await page.mouse.dblclick(mid.x, mid.y);
    const point = page.locator('.sc-reroute').first();
    await point.waitFor();
    await point.hover();
    await same('wire-reroute');
    await point.dblclick();
    await point.waitFor({ state: 'detached' });
    await page.mouse.move(5, 500);
    await saved();

    // Zoomed out: name tags, with a comment count and a "changed" mark (approved before the Preview changed).
    expect((await page.request.post(`${s.api}/review/comments`, { data: { outputId: 'banner', text: 'Bigger logo' } })).status()).toBe(201);
    expect((await page.request.put(`${s.api}/review/approvals/sq`, { data: { fingerprint: 'before' } })).status()).toBe(200);
    await page.reload();
    await node('Image').waitFor();
    await fit();
    for (let i = 0; i < 4 && !(await page.locator('.sc-zlabels').count()); i++) {
      await bar.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await page.waitForTimeout(300);
    }
    await page.locator('.sc-zlabel__mark--warn').waitFor();
    await page.mouse.move(5, 500);
    await imagesLoaded();
    await same('zoomed-out');
    await fit();
  }, limit(120_000));
});

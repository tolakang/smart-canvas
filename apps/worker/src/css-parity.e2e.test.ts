/**
 * CSS cleanup safety net (see test/css-reference/README.md): each screen and state of the app, drawn with the app's
 * stylesheets and with the frozen reference copy, must match exactly — every element's computed style and every
 * pixel. Board, nodes and their hover / selected states, menus, the inspector, editors, dialogs, side panels,
 * dark theme, the Projects home and first-run screens, and a phone.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cssParity, referenceCss, STRAY } from './test/css-parity';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('CSS cleanup: the app looks exactly like the reference CSS', () => {
  let stack: Stack;
  let page: Page;
  let board = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // A fixed clock: "edited … ago" and dates read the same in both draws.
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const same = async (name: string) => {
    const r = await cssParity(page, name);
    expect(r.styles, `${name}: computed styles`).toEqual([]);
    expect(r.pixels, `${name}: pixels`).toBeLessThanOrEqual(STRAY);
  };
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const node = (title: string) => page.locator('.react-flow__node').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${title}$`) }) });
  const imagesLoaded = () => expect.poll(() => page.locator('img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete))).toBe(true);
  const fit = async () => {
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(400);
  };

  it('first-run screen', async () => {
    await page.goto(stack.env.webUrl);
    await page.getByText('First run? Set up the workspace').waitFor();
    await same('first-run');
  }, 60_000);

  it('the check itself: a one-rule change to the reference is caught', async () => {
    const r = await cssParity(page, 'self-check', `${referenceCss()}\nbody * { outline: 1px solid red; }`);
    expect(r.styles.some((d) => d.includes(':: outline-style'))).toBe(true);
    expect(r.pixels).toBeGreaterThan(STRAY);
  }, 60_000);

  it('board: every asset node with pictures and text, Previews in each group', async () => {
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Parity');
    const url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = p.doc;
    for (const [id, label, width, height] of [
      ['sq', 'Square post', 1080, 1080],
      ['story', 'Story', 1080, 1920],
      ['banner', 'Banner', 1500, 500],
    ] as const)
      doc = ok(addOutput(doc, { id, label, size: { width, height, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    board = page.url();
    await page.reload();
    await node('Image').waitFor();

    const png = (width: number, height: number, r: number, g: number, b: number) => sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
    const wide = await png(300, 100, 220, 40, 40);
    const tall = await png(100, 300, 40, 80, 220);
    const both = [
      { name: 'wide.png', mimeType: 'image/png', buffer: wide },
      { name: 'tall.png', mimeType: 'image/png', buffer: tall },
    ];
    await node('Logo').locator('input[type=file][multiple]').first().setInputFiles(both);
    await node('Image').locator('input[type=file][multiple]').first().setInputFiles(both);
    await expect.poll(() => node('Image').locator('.sc-slot__pick img').count(), { timeout: 20_000 }).toBe(2);
    await node('Headline').locator('input[type=file]').first().setInputFiles({ name: 'khmer.png', mimeType: 'image/png', buffer: wide });
    await node('Background').locator('input[type=file]').nth(1).setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: await png(400, 400, 240, 200, 120) });
    await node('Text').getByRole('textbox').first().fill('Big summer sale');
    await saved();
    await fit();
    await imagesLoaded();
    await same('board');
  }, 120_000);

  it('board states: a slot hovered, a node selected with its inspector, a wire selected', async () => {
    await node('Image').locator('.sc-slot__pick img').first().hover();
    await same('slot-hover');
    await node('Image').locator('.sc-slot__pick img').first().click();
    await page.mouse.move(5, 500);
    await same('node-selected');
    await page.locator('.react-flow__edge').first().click({ force: true });
    await same('wire-selected');
    await page.keyboard.press('Escape');
  }, 60_000);

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
  }, 60_000);

  it('side panels: History and Review', async () => {
    await page.getByRole('button', { name: 'History' }).click();
    await page.waitForTimeout(500);
    await same('history');
    await page.getByRole('button', { name: 'History' }).first().click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('complementary', { name: 'Review' }).waitFor();
    await same('review');
    await page.getByRole('button', { name: 'Review', exact: true }).click();
  }, 60_000);

  it('dialogs: Export', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('dialog', { name: 'Export' }).waitFor();
    await same('export-dialog');
    await page.keyboard.press('Escape');
  }, 60_000);

  it('editors: Layer Comp, a Preview, its Comments panel', async () => {
    await page.locator('.react-flow__node-mainNode').getByRole('button', { name: /^(Edit|View) Square layout$/ }).click({ force: true });
    const comp = page.getByRole('dialog', { name: /Layer Comp editor/ });
    await comp.waitFor();
    await imagesLoaded();
    await same('layer-comp-editor');
    await comp.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Edit Preview Banner' }).click();
    const preview = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await preview.waitFor();
    await imagesLoaded();
    await same('preview-editor');
    await preview.getByRole('button', { name: 'Comment', exact: true }).click();
    await preview.getByRole('complementary', { name: 'Comments' }).waitFor();
    await same('comments');
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
  }, 90_000);

  it('dark theme: board and an editor', async () => {
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await page.waitForTimeout(300);
    await same('board-dark');
    await page.getByRole('button', { name: 'Edit Preview Banner' }).click();
    const preview = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await preview.waitFor();
    await same('preview-editor-dark');
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Dark theme' }).click(); // the same toggle, pressed
  }, 60_000);

  it('Projects home, the Team and Size presets dialogs', async () => {
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    await imagesLoaded();
    await same('projects');
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByRole('dialog', { name: /Team/ }).waitFor();
    await same('team-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Size presets' }).click();
    await page.getByRole('dialog').waitFor();
    await same('presets-dialog');
    await page.keyboard.press('Escape');
  }, 60_000);

  it('phone: the board and a Preview editor', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(board);
    await node('Image').waitFor();
    await imagesLoaded();
    await same('phone-board');
    await page.getByRole('button', { name: 'Edit Preview Banner' }).click({ force: true });
    await page.getByRole('dialog', { name: 'Preview editor Banner' }).waitFor();
    await imagesLoaded();
    await same('phone-preview-editor');
  }, 60_000);
});

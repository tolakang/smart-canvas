/**
 * Tailwind conversion safety net (see test/css-reference/README.md): each screen and state of the app, drawn with the
 * app's stylesheets and with main's built CSS, must match exactly — every element's computed style and every pixel. Board, nodes and their hover / selected states, menus, the inspector, editors, dialogs, side panels,
 * dark theme, the Projects home and first-run screens, and a phone (as a touch device).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, libraryEntryOf, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cssParity, referenceCss, STRAY } from './test/css-parity';
import { twoPagePdf } from './test/pdf-fixture';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

// Probing which rules win (test/css-winners.ts) is slow; the time limits are only for the comparison.
const limit = (ms: number) => (process.env.SC_PROBE_OUT ? 900_000 : ms);

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('CSS parity: the app looks exactly like main', () => {
  let stack: Stack;
  let page: Page;
  let board = '';
  let api = ''; // the project's API url

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // A fixed clock: "edited … ago" and dates read the same in both draws.
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
  }, limit(120_000));
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
  }, limit(60_000));

  it('the check itself: a one-rule change to the reference is caught', async () => {
    const r = await cssParity(page, 'self-check', `${referenceCss()}\nbody * { outline: 1px solid red; }`);
    expect(r.styles.some((d) => d.includes(':: outline-style'))).toBe(true);
    expect(r.pixels).toBeGreaterThan(STRAY);
  }, limit(60_000));

  it('board: every asset node with pictures and text, Previews in each group', async () => {
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Parity');
    const url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    api = url;
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
  }, limit(120_000));

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
    await history.getByRole('button', { name: /Sent to client/ }).first().click();
    await page.locator('.sc-board__version').waitFor();
    await page.waitForTimeout(500);
    await same('version-shown');
    await page.locator('.sc-board__version').getByRole('button', { name: 'Close' }).click();
    await page.locator('.sc-board__version').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Close history' }).click();
    await page.mouse.move(5, 500);
  }, limit(90_000));

  it('dialogs: Export', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('dialog', { name: 'Export' }).waitFor();
    await same('export-dialog');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('dialogs: Team fonts and Team library (the Assets menu), the PDF page picker', async () => {
    // The library shows one item of each look: a picture, a text and a colour.
    const doc = ((await (await page.request.get(api)).json()) as { doc: ProjectDoc }).doc;
    const library = api.replace(/projects\/.*$/, 'library');
    for (const kind of ['image', 'text'] as const) {
      const source = doc.sources.find((x) => x.kind === kind);
      if (source) expect((await page.request.post(library, { data: { ...libraryEntryOf(source), tags: [] } })).status()).toBe(201);
    }
    const fill = { name: 'Brand red', tags: ['brand'], kind: 'fill', behavesLike: 'background', content: { kind: 'fill', fill: { type: 'solid', color: '#cc0000' } } };
    expect((await page.request.post(library, { data: fill })).status()).toBe(201);
    for (const [item, name] of [
      ['Team fonts', 'fonts-dialog'],
      ['Team library', 'library-dialog'],
    ] as const) {
      await page.getByRole('button', { name: 'Assets' }).click();
      await page.getByRole('menuitem', { name: item }).click();
      await page.getByRole('dialog').waitFor();
      await page.waitForTimeout(300);
      await same(name);
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
    await node('Image').locator('input[type=file][multiple]').first().setInputFiles({ name: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from(twoPagePdf(), 'latin1') });
    const pdf = page.getByRole('dialog', { name: 'Which page?' });
    await pdf.waitFor({ timeout: 20_000 });
    await expect.poll(() => pdf.locator('.sc-pdfpages__page img').count(), { timeout: 15_000 }).toBe(2);
    await imagesLoaded();
    await same('pdf-pages-dialog');
    await pdf.getByRole('button', { name: 'Cancel' }).click();
    await pdf.waitFor({ state: 'detached' });
  }, limit(90_000));

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
  }, limit(90_000));

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
  }, limit(60_000));

  it('tablet width: the board, its top bar short (1100 px and narrower)', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await fit();
    await same('tablet-board');
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menu').waitFor();
    await same('tablet-add-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    await page.getByRole('complementary', { name: 'Inspector' }).waitFor();
    await same('tablet-inspector');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await fit();
  }, limit(60_000));

  it('Projects home (a row and a template hovered, search, nothing found), the Team and Size presets dialogs', async () => {
    // A template, so the Templates cards (and New project's "Start from") show.
    expect((await page.request.post(`${api}/duplicate`, { data: { name: 'Summer template', isTemplate: true } })).ok()).toBe(true);
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    await imagesLoaded();
    await same('projects');
    await page.locator('.sc-home__section > .sc-rows > li').first().hover();
    await same('projects-row-hover');
    await page.locator('.sc-tcard').first().hover();
    await same('template-hover');
    const search = page.getByRole('searchbox', { name: 'Search projects' });
    await search.click();
    await same('projects-search');
    await search.fill('nothing like this');
    await same('projects-none');
    await search.fill('');
    await page.mouse.move(5, 5);
    await page.getByRole('button', { name: /^More actions for / }).first().click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('dialog', { name: /^Rename/ }).waitFor();
    await same('ask-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('dialog', { name: 'New project' }).waitFor();
    await same('new-project-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByRole('dialog', { name: /Team/ }).waitFor();
    await same('team-dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Size presets' }).click();
    await page.getByRole('dialog').waitFor();
    await same('presets-dialog');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('sign-in screen', async () => {
    const signedIn = page;
    const out = await stack.env.browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await out.newPage();
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await same('sign-in');
    await out.close();
    page = signedIn;
  }, limit(60_000));

  it('phone: the board and a Preview editor', async () => {
    // A touch phone: `pointer: coarse` and `hover: none` hold, as on a real one (Tailwind's hover: depends on it).
    const phone = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
    page = await phone.newPage();
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
    expect(await page.evaluate(() => matchMedia('(pointer: coarse) and (hover: none)').matches)).toBe(true);
    await page.goto(board);
    await node('Image').waitFor();
    await imagesLoaded();
    await same('phone-board');
    await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    await page.getByRole('complementary', { name: 'Inspector' }).waitFor();
    await page.waitForTimeout(400);
    await same('phone-inspector');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    // On touch the first tap on a small panel zooms to it (Q8); the next one opens the editor.
    const editor = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await expect
      .poll(
        async () => {
          if (await editor.isVisible()) return true;
          await page.getByRole('button', { name: 'Edit Preview Banner' }).click({ force: true });
          await page.waitForTimeout(600);
          return editor.isVisible();
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await imagesLoaded();
    await same('phone-preview-editor');
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    await imagesLoaded();
    await same('phone-projects');
    const out = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page = await out.newPage();
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
    await page.goto(stack.env.webUrl);
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await same('phone-sign-in');
  }, limit(60_000));
});

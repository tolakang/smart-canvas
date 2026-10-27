/**
 * Tailwind conversion safety net (see test/css-reference/README.md): each screen and state of the app, drawn with the
 * app's stylesheets and with main's built CSS, must match exactly — every element's computed style and every pixel. Board, nodes and their hover / selected states, menus, the inspector, editors, dialogs, side panels,
 * dark theme, the Projects home and first-run screens, and a phone (as a touch device).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, addPresetSet, libraryEntryOf, setOutputLayout, setPreviewHidden, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
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
    expect((await page.request.post(`${api}/review/comments`, { data: { outputId: 'banner', text: 'Bigger logo' } })).status()).toBe(201);
    expect((await page.request.put(`${api}/review/approvals/sq`, { data: { fingerprint: 'before' } })).status()).toBe(200);
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

  it('pipeline cards: an approved Preview, a Preset node (a size hidden, one disconnected), a chosen chip, their hovers', async () => {
    await page.getByRole('button', { name: 'Edit Preview Banner' }).click();
    const preview = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await preview.waitFor();
    await preview.getByRole('group', { name: 'Approval' }).getByRole('button', { name: 'Approve' }).click();
    await preview.getByText(/✓ Approved/).waitFor();
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await preview.waitFor({ state: 'detached' });

    const p = (await (await page.request.get(api)).json()) as { rev: number; doc: ProjectDoc };
    const right = Math.max(...p.doc.outputs.map((o) => o.board.x)) + 360;
    const top = Math.min(...p.doc.outputs.map((o) => o.board.y));
    const px = (width: number, height: number) => ({ width, height, unit: 'px' as const });
    let doc = ok(addPresetSet(p.doc, { id: 'gdn', label: 'GDN', board: { x: right, y: top }, sizes: [{ id: 'g1', label: 'GDN 300×250', size: px(300, 250) }, { id: 'g2', label: 'GDN 728×90', size: px(728, 90) }] }));
    doc = ok(setPreviewHidden(doc, 'gdn', 'g1', true));
    doc = { ...doc, edges: doc.edges.filter((e) => !(e.kind === 'composition' && e.to === 'g2')) }; // g2 disconnected: frozen
    doc = ok(setOutputLayout(doc, 'banner', 'square', 'chosen-1'));
    expect((await page.request.put(api, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await node('Image').waitFor();
    await fit();
    await imagesLoaded();
    await page.mouse.move(5, 500);
    await same('pipeline');
    for (const [target, screen] of [
      [page.locator('.sc-comp__group').first(), 'comp-row-hover'],
      [page.locator('[aria-label="Preset GDN"] .sc-port').last(), 'preset-row-hover'],
      [page.locator('.sc-rule__chip-reset').first(), 'chip-reset-hover'],
      [page.getByRole('button', { name: 'Export Preview Banner' }), 'preview-export-hover'],
    ] as const) {
      await target.hover();
      await page.waitForTimeout(250);
      await same(screen);
    }
    await page.mouse.move(5, 500);
    await page.locator('.sc-health__btn[aria-expanded]').first().click();
    await page.getByRole('list', { name: 'Layout issues' }).first().waitFor();
    await page.mouse.move(5, 500);
    await same('health-list');
    await page.keyboard.press('Escape');
    await page.locator('.sc-health__btn[aria-expanded="true"]').first().click().catch(() => undefined);
    const gdn = page.locator('[aria-label="Preset GDN"]');
    await gdn.getByRole('button', { name: /Custom size/ }).click();
    await gdn.getByRole('textbox', { name: 'Width (px)' }).waitFor();
    await same('preset-custom');
    await gdn.getByRole('button', { name: 'Cancel' }).click();
  }, limit(120_000));

  it('node cards: the ⋯ button and its menu, a header action, renaming, a field hovered and focused', async () => {
    const text = node('Text');
    await text.locator('.sc-head__more').hover();
    await same('node-more-hover');
    await text.locator('.sc-head__more').click();
    await page.getByRole('menu').waitFor();
    await same('node-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit Preview Banner' }).hover();
    await same('node-action-hover');
    const preset = page.locator('.react-flow__node-presetNode').first();
    await preset.locator('.sc-node__title').dblclick();
    await preset.getByRole('textbox', { name: 'Preset name' }).waitFor();
    await same('node-rename');
    await page.keyboard.press('Escape');
    await page.mouse.move(5, 500);
    await text.getByRole('textbox').first().hover();
    await same('node-field-hover');
    await text.getByRole('textbox').first().focus();
    await same('node-field-focus');
    await page.mouse.click(5, 500);
  }, limit(60_000));

  it('asset slots: drop targets, empty and hidden slots, the list view, uploading, Headline pairs and the language switch, text slots', async () => {
    // A second text slot and a second headline pair; then the second logo and the second text hidden (seeded).
    await node('Text').getByRole('button', { name: 'Add text' }).click();
    await node('Headline').getByRole('button', { name: 'Add headline' }).click();
    await saved();
    const p = (await (await page.request.get(api)).json()) as { rev: number; doc: ProjectDoc };
    const items = (label: string) => p.doc.stacks?.find((s) => s.label === label)?.items ?? [];
    const hide = new Set([items('Logo')[1], items('Text')[1]]);
    const doc = { ...p.doc, sources: p.doc.sources.map((s) => (hide.has(s.id) ? { ...s, visible: false } : s)) };
    expect((await page.request.put(api, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await node('Image').waitFor();
    await fit();
    await imagesLoaded();
    await same('assets-hidden');

    const image = node('Image');
    await image.locator('.sc-dropzone').hover();
    await same('dropzone-hover');
    // A file dragged over a slot, then over the card.
    const files = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      return d;
    });
    await page.mouse.move(5, 500);
    await image.locator('.sc-slot').first().dispatchEvent('dragover', { dataTransfer: files });
    await same('slot-drop-over');
    await image.locator('.sc-slot').first().dispatchEvent('dragleave', { dataTransfer: files });
    await image.locator('.sc-dropzone').dispatchEvent('dragover', { dataTransfer: files });
    await same('card-drop-over');
    await image.dispatchEvent('dragleave', { dataTransfer: files });

    await image.locator('.sc-slot').first().hover();
    await image.getByRole('button', { name: /^Delete / }).first().hover();
    await same('slot-delete-hover');
    await image.getByRole('button', { name: /^Remove picture from / }).first().hover();
    await same('slot-act-hover');
    await page.mouse.move(5, 500);
    await image.getByRole('button', { name: /^Select / }).first().focus();
    await same('slot-focus-within');
    await page.mouse.click(5, 500);

    // A slot whose picture was removed keeps its Delete on hover.
    const logo = node('Logo');
    await logo.locator('.sc-slot').nth(1).hover();
    await logo.getByRole('button', { name: /^Remove picture from / }).nth(1).click();
    await expect(logo.locator('.sc-slot--empty')).toHaveCount(1);
    await page.mouse.move(5, 500);
    await logo.locator('.sc-slot--empty').hover();
    await same('slot-empty-hover');
    await node('Background').locator('.sc-slot--empty').first().hover();
    await same('background-empty-hover');
    await page.mouse.move(5, 500);

    // The list view, a row hovered and one selected.
    await image.locator('.sc-head__more').click();
    await page.getByRole('menuitem', { name: 'List view' }).click();
    await image.locator('.sc-slot--row').first().hover();
    await same('assets-list-hover');
    await image.getByRole('button', { name: /^Select / }).nth(1).click();
    await page.mouse.move(5, 500);
    await same('assets-list-selected');
    await image.locator('.sc-head__more').click();
    await page.getByRole('menuitem', { name: 'Grid view' }).click();
    await page.mouse.click(5, 500);

    // Uploading: the card's drop area and a slot being replaced, while the upload waits.
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/teams/*/assets', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await held;
      await route.abort();
    });
    const png = { name: 'c.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#888' } }).png().toBuffer() };
    await image.locator('input[type=file][multiple]').setInputFiles(png);
    await logo.locator('.sc-slot input[type=file]').first().setInputFiles(png);
    await image.locator('.sc-dropzone--busy').waitFor();
    await same('uploading');
    release();
    await page.unroute('**/api/teams/*/assets');
    await image.locator('.sc-dropzone--busy').waitFor({ state: 'detached' });
    // A file the Background can't use: its error spans the slots.
    await node('Background').locator('input[type=file]').first().setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await node('Background').locator('.sc-error').waitFor();
    await same('upload-errors');

    // Headline: two pairs, a pair hovered with its Delete, English in use by keyboard, the other language hovered.
    const headline = node('Headline');
    await headline.locator('.sc-hl-row').nth(1).hover();
    await same('headline-row-hover');
    await headline.getByRole('button', { name: 'Delete headline 2' }).hover();
    await same('headline-delete-hover');
    await page.mouse.move(5, 500);
    await headline.getByRole('radio', { name: 'Khmer' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(headline.getByRole('radio', { name: 'English' })).toBeChecked();
    await saved();
    await same('headline-english-key');
    await headline.locator('.sc-slot--off img').first().hover();
    await same('headline-off-hover');
    await headline.getByRole('radio', { name: 'English' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(headline.getByRole('radio', { name: 'Khmer' })).toBeChecked();
    await page.mouse.click(5, 500);

    // Text slots: one hovered, one being typed in, its Delete hovered.
    const text = node('Text');
    await text.locator('.sc-text-slot').first().hover();
    await same('text-slot-hover');
    await text.getByRole('textbox').first().focus();
    await same('text-slot-focus');
    await text.getByRole('button', { name: /^Delete / }).first().hover();
    await same('text-remove-hover');
    await page.mouse.click(5, 500);
    await saved();
  }, limit(120_000));

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
    await node('Text').getByRole('textbox').first().focus();
    await same('phone-text-focus');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
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

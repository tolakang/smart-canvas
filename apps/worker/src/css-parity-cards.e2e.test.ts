/**
 * CSS parity (P28, TAILWIND-PLAN.md): the node cards (Layer Comp, Presets, Previews, the asset slots' states). Each
 * screen is drawn with this branch's CSS and with main's, and every computed style and pixel must match. Runs on its
 * own stack and seeded project (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addPresetSet, setOutputLayout, setPreviewHidden, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { limit, ok, paritySuite } from './test/parity-suite';

describe.skipIf(!adminUrl)('CSS parity: the node cards: Layer Comp, Presets, Previews, asset slots', () => {
  const { s, same, saved, node, imagesLoaded, fit, seed } = paritySuite();
  let page: Page;
  beforeAll(async () => {
    page = s.page;
    await seed();
  }, limit(180_000));

  it('pipeline cards: an approved Preview, a Preset node (a size hidden, one disconnected), a chosen chip, their hovers', async () => {
    await page.getByRole('button', { name: 'Edit Preview Banner' }).click();
    const preview = page.getByRole('dialog', { name: 'Preview editor Banner' });
    await preview.waitFor();
    await preview.getByRole('group', { name: 'Approval' }).getByRole('button', { name: 'Approve' }).click();
    await preview.getByText(/✓ Approved/).waitFor();
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await preview.waitFor({ state: 'detached' });

    const p = (await (await page.request.get(s.api)).json()) as { rev: number; doc: ProjectDoc };
    const right = Math.max(...p.doc.outputs.map((o) => o.board.x)) + 360;
    const top = Math.min(...p.doc.outputs.map((o) => o.board.y));
    const px = (width: number, height: number) => ({ width, height, unit: 'px' as const });
    let doc = ok(addPresetSet(p.doc, { id: 'gdn', label: 'GDN', board: { x: right, y: top }, sizes: [{ id: 'g1', label: 'GDN 300×250', size: px(300, 250) }, { id: 'g2', label: 'GDN 728×90', size: px(728, 90) }] }));
    doc = ok(setPreviewHidden(doc, 'gdn', 'g1', true));
    doc = { ...doc, edges: doc.edges.filter((e) => !(e.kind === 'composition' && e.to === 'g2')) }; // g2 disconnected: frozen
    doc = ok(setOutputLayout(doc, 'banner', 'square', 'chosen-1'));
    expect((await page.request.put(s.api, { data: { rev: p.rev, doc } })).status()).toBe(200);
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

  it('asset slots: drop targets, slot actions, empty and hidden slots', async () => {
    // A second text slot and a second headline pair; then the second logo and the second text hidden (seeded).
    await node('Text').getByRole('button', { name: 'Add text' }).click();
    await node('Headline').getByRole('button', { name: 'Add headline' }).click();
    await saved();
    const p = (await (await page.request.get(s.api)).json()) as { rev: number; doc: ProjectDoc };
    const items = (label: string) => p.doc.stacks?.find((s) => s.label === label)?.items ?? [];
    const hide = new Set([items('Logo')[1], items('Text')[1]]);
    const doc = { ...p.doc, sources: p.doc.sources.map((s) => (hide.has(s.id) ? { ...s, visible: false } : s)) };
    expect((await page.request.put(s.api, { data: { rev: p.rev, doc } })).status()).toBe(200);
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
    await image.getByRole('button', { name: /^Delete / }).first().hover({ force: true });
    await same('slot-delete-hover');
    await image.getByRole('button', { name: /^Remove picture from / }).first().hover({ force: true });
    await same('slot-act-hover');
    await page.mouse.move(5, 500);
    await image.getByRole('button', { name: /^Select / }).first().focus();
    await same('slot-focus-within');
    await page.mouse.click(5, 500);

    // A slot whose picture was removed keeps its Delete on hover.
    const logo = node('Logo');
    const empties = await logo.locator('.sc-slot--empty').count();
    await logo.locator('.sc-slot').nth(1).hover();
    await logo.getByRole('button', { name: /^Remove picture from / }).nth(1).click({ force: true });
    await expect.poll(() => logo.locator('.sc-slot--empty').count()).toBe(empties + 1);
    await page.mouse.move(5, 500);
    await logo.locator('.sc-slot--empty').last().hover();
    await same('slot-empty-hover');
    await node('Background').locator('.sc-slot--empty').first().hover();
    await same('background-empty-hover');
    await page.mouse.move(5, 500);

  }, limit(300_000));

  it('asset slots: the list view, uploading, upload errors', async () => {
    const image = node('Image');
    const logo = node('Logo');
    // The list view, a row hovered and one selected.
    await image.locator('.sc-head__more').click();
    await page.getByRole('menuitem', { name: 'List view' }).click();
    await image.locator('.sc-slot--row').first().hover();
    await same('assets-list-hover');
    await page.mouse.move(5, 500);
    await image.getByRole('button', { name: /^Select / }).nth(1).click({ force: true });
    await page.mouse.move(5, 500);
    await same('assets-list-selected');
    await image.locator('.sc-head__more').click();
    await page.getByRole('menuitem', { name: 'Grid view' }).click();
    await page.mouse.click(5, 500);

    // Uploading: the card's drop area and a slot being replaced, while the upload waits.
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    let failed = 0;
    await page.route('**/api/teams/*/assets', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await held;
      await route.fulfill({ status: 500, json: { error: 'held' } });
      failed++;
    });
    const png = { name: 'c.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#888' } }).png().toBuffer() };
    await image.locator('input[type=file][multiple]').setInputFiles(png);
    await logo.locator('.sc-slot input[type=file]').first().setInputFiles(png);
    await image.locator('.sc-dropzone--busy').waitFor();
    await same('uploading');
    release();
    await expect.poll(() => failed).toBe(2);
    await page.unroute('**/api/teams/*/assets');
    await image.locator('.sc-dropzone--busy').waitFor({ state: 'detached' });
    // A file the Background can't use: its error spans the slots.
    await node('Background').locator('input[type=file]').first().setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await node('Background').locator('.sc-error').waitFor();
    await same('upload-errors');

  }, limit(300_000));

  it('asset slots: Headline pairs and the language switch, text slots', async () => {
    // Headline: two pairs, a pair hovered with its Delete, English in use by keyboard, the other language hovered.
    const headline = node('Headline');
    await headline.locator('.sc-hl-row').nth(1).hover();
    await same('headline-row-hover');
    await headline.getByRole('button', { name: 'Delete headline 2' }).hover({ force: true });
    await same('headline-delete-hover');
    await page.mouse.move(5, 500);
    await headline.getByRole('radio', { name: 'Khmer' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => headline.getByRole('radio', { name: 'English' }).isChecked()).toBe(true);
    await saved();
    await same('headline-english-key');
    await headline.locator('.sc-slot--off img').first().hover();
    await same('headline-off-hover');
    await headline.getByRole('radio', { name: 'English' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => headline.getByRole('radio', { name: 'Khmer' }).isChecked()).toBe(true);
    await page.mouse.click(5, 500);

    // Text slots: one hovered, one being typed in, its Delete hovered.
    const text = node('Text');
    await text.locator('.sc-text-slot').first().hover();
    await same('text-slot-hover');
    await text.getByRole('textbox').first().focus();
    await same('text-slot-focus');
    await text.getByRole('button', { name: /^Delete / }).first().hover({ force: true });
    await same('text-remove-hover');
    await page.mouse.click(5, 500);
    await saved();
  }, limit(300_000));
});

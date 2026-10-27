/**
 * CSS parity (P28, TAILWIND-PLAN.md): the board's dialogs (Export, Team fonts, Team library, the PDF page picker).
 * Each screen is drawn with this branch's CSS and with main's, and every computed style and pixel must match. Runs on
 * its own stack and seeded project (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { libraryEntryOf, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { limit, paritySuite } from './test/parity-suite';
import { twoPagePdf } from './test/pdf-fixture';

describe.skipIf(!adminUrl)('CSS parity: the dialogs: Export, fonts, library, PDF pages', () => {
  const { s, same, node, imagesLoaded, seed } = paritySuite();
  let page: Page;
  beforeAll(async () => {
    page = s.page;
    await seed();
  }, limit(180_000));

  it('dialogs: Export', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('dialog', { name: 'Export' }).waitFor();
    await same('export-dialog');
    await page.keyboard.press('Escape');
  }, limit(60_000));

  it('dialogs: Team fonts and Team library (the Assets menu), the PDF page picker', async () => {
    // The library shows one item of each look: a picture, a text and a colour.
    const doc = ((await (await page.request.get(s.api)).json()) as { doc: ProjectDoc }).doc;
    const library = s.api.replace(/projects\/.*$/, 'library');
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
});

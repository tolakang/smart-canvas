/**
 * CSS parity (P28, TAILWIND-PLAN.md): the editors (Layer Comp, a Preview, comments) and the dark theme. Each screen is
 * drawn with this branch's CSS and with main's, and every computed style and pixel must match. Runs on its own stack
 * and seeded project (test/parity-suite.ts).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { limit, paritySuite } from './test/parity-suite';

describe.skipIf(!adminUrl)('CSS parity: the editors: Layer Comp, a Preview, comments, dark theme', () => {
  const { s, same, node, fit, imagesLoaded, seed } = paritySuite();
  let page: Page;
  beforeAll(async () => {
    page = s.page;
    await seed();
  }, limit(180_000));

  it('editors: Layer Comp, a Preview, its Comments panel', async () => {
    await page.locator('.react-flow__node-mainNode').getByRole('button', { name: /^(Edit|View) Square layout$/ }).click({ force: true });
    const comp = page.getByRole('dialog', { name: /Layer Comp editor/ });
    await comp.waitFor();
    await imagesLoaded();
    await same('layer-comp-editor');
    // A layer selected (the box, its size), a zoom button hovered; the Hand tool on, then hovered (hover beats pressed).
    await comp.locator('.sc-layer__name').first().click();
    await comp.getByTestId('selection-size').waitFor();
    await comp.getByRole('button', { name: 'Zoom in', exact: true }).hover();
    await same('editor-selected');
    await comp.getByRole('button', { name: 'Hand tool (H)' }).click();
    await page.mouse.move(800, 990);
    await same('editor-hand');
    await comp.getByRole('button', { name: 'Hand tool (H)' }).hover();
    await same('editor-hand-hover');
    await comp.getByRole('button', { name: 'Move tool (V)' }).click();
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

    // Approval in the bar: changed since approved (Square post approved with an older fingerprint), Approve again hovered.
    const approved = await page.request.put(`${s.api}/review/approvals/sq`, { data: { fingerprint: 'before' } });
    expect(approved.status()).toBe(200);
    await page.reload(); // the board reads approvals when it loads
    await node('Image').waitFor();
    await fit();
    await page.getByRole('button', { name: 'Edit Preview Square post' }).click();
    const square = page.getByRole('dialog', { name: 'Preview editor Square post' });
    await square.getByText('Changed since approved').waitFor();
    await page.mouse.move(5, 500);
    await same('approval-changed');
    await square.getByRole('button', { name: 'Approve again' }).hover();
    await same('approve-hover');
    await square.getByRole('button', { name: 'Close', exact: true }).click();
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
});

/**
 * The CSS parity test's shared parts (P28; TAILWIND-PLAN.md): each `css-parity-*.e2e.test.ts` file runs on its own
 * stack and seeded project, so vitest runs the files side by side.
 *
 * SC_PARITY_ONLY=assets,history compares only the screens whose name contains one of the words; the others still run
 * their steps (later screens depend on them) but skip the comparison. The full run is the default, and CI's.
 */
import type { ProjectDoc, SourceResult } from '@smart-canvas/core';
import { addOutput } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, expect } from 'vitest';
import { cssParity, STRAY } from './css-parity';
import { setupAndCreateProject, startStack, type Stack } from './stack';

/** Probing which rules win (test/css-winners.ts) is slow; CI runners can be several times slower than a laptop. */
export const limit = (ms: number) => (process.env.SC_PROBE_OUT ? 900_000 : process.env.CI ? ms * 3 : ms);

export const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

const only = process.env.SC_PARITY_ONLY?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** Whether this run compares the screen `name` (SC_PARITY_ONLY). */
export const compares = (name: string) => !only?.length || only.some((w) => name.includes(w));

/** A fixed clock: "edited … ago" and dates read the same in both draws. */
export const FIXED_TIME = new Date('2026-10-26T09:00:00Z');

export interface ParitySuite {
  stack: Stack;
  /** The page under test (a file may swap it, e.g. for a phone). */
  page: Page;
  /** The seeded project's board URL and its API URL (after `seed`). */
  board: string;
  api: string;
}

/**
 * Starts a stack and a desktop page for the surrounding `describe`, and returns the helpers every parity file uses.
 * `same(name)` compares the page as it stands with main's CSS: every computed style and every pixel.
 */
export function paritySuite() {
  const s = {} as ParitySuite;
  beforeAll(async () => {
    s.stack = await startStack();
    s.page = await s.stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await s.page.clock.setFixedTime(FIXED_TIME);
  }, limit(120_000));
  afterAll(async () => {
    await s.stack?.close();
  });

  const same = async (name: string) => {
    if (!compares(name)) return;
    const r = await cssParity(s.page, name);
    expect(r.styles, `${name}: computed styles`).toEqual([]);
    expect(r.pixels, `${name}: pixels`).toBeLessThanOrEqual(STRAY);
  };
  const saved = () => s.page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const node = (title: string) => s.page.locator('.react-flow__node').filter({ has: s.page.locator('.sc-node__title', { hasText: new RegExp(`^${title}$`) }) });
  const imagesLoaded = () => expect.poll(() => s.page.locator('img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete))).toBe(true);
  const fit = async () => {
    await s.page.getByRole('button', { name: /^Fit to screen/ }).click();
    await s.page.waitForTimeout(400);
  };
  /** A phone (touch: `pointer: coarse`, `hover: none`) signed in as the desktop page is. */
  const phone = async () => {
    const ctx = await s.stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await s.page.context().storageState() });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    return page;
  };

  /**
   * The seeded project every screen starts from: three Previews (square, story, banner), two pictures in the Logo and
   * Image nodes, a Khmer headline, a square background and a text. Ends on the board, fitted, with every image loaded.
   */
  const seed = async () => {
    const { page } = s;
    const { teamId, projectId } = await setupAndCreateProject(page, s.stack.env.webUrl, 'Parity');
    s.api = `${s.stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const p = (await (await page.request.get(s.api)).json()) as { rev: number; doc: ProjectDoc };
    let doc = p.doc;
    for (const [id, label, width, height] of [
      ['sq', 'Square post', 1080, 1080],
      ['story', 'Story', 1080, 1920],
      ['banner', 'Banner', 1500, 500],
    ] as const)
      doc = ok(addOutput(doc, { id, label, size: { width, height, unit: 'px' } }));
    expect((await page.request.put(s.api, { data: { rev: p.rev, doc } })).status()).toBe(200);
    s.board = page.url();
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
  };

  return { s, same, saved, node, imagesLoaded, fit, phone, seed };
}

/**
 * Spike S2 — Khmer text parity. Five Khmer headlines, laid out in six outputs:
 * - the board (what the user sees, at device scale 2) and the export worker's render page break them into
 *   the same lines at the same font size;
 * - every break is an Intl.Segmenter('km') word boundary;
 * - nothing is clipped: the drawn glyphs (subscripts and vowels above included) stay inside the text box,
 *   and the text box inside the canvas.
 * Results: docs/spikes/S2-KHMER-PARITY.md.
 */
import { addOutput, connectSource, type ProjectDoc, type SourceResult, type TextStyle } from '@smart-canvas/core';
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { BrowserContext, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FRAME, openRender } from './render';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

/** Subscript stacks (្ក ្រ ្ត្រ), vowels above and below, a Latin mix, Khmer digits. */
const HEADLINES: { text: string; font: string; weight: number }[] = [
  { text: 'សូមស្វាគមន៍មកកាន់ប្រទេសកម្ពុជា', font: 'Noto Sans Khmer', weight: 700 },
  { text: 'ការលក់ពិសេសថ្ងៃនេះ បញ្ចុះតម្លៃ ៥០%', font: 'Noto Sans Khmer', weight: 400 },
  { text: 'ព្រឹត្តិការណ៍ពិសេស Grand opening', font: 'Kantumruy Pro', weight: 700 },
  { text: 'ស្ត្រីខ្មែរស្រស់ស្អាតជារៀងរហូត', font: 'Kantumruy Pro', weight: 400 },
  { text: 'ក្រុមហ៊ុនផ្គត់ផ្គង់គ្រឿងសង្ហារិមល្អបំផុតក្នុងរាជធានីភ្នំពេញ', font: 'Noto Sans Khmer', weight: 700 },
];

const OUTPUTS = [
  { id: 'portrait', label: 'Portrait', size: { width: 1080, height: 1350, unit: 'px' as const } },
  { id: 'square', label: 'Square', size: { width: 1080, height: 1080, unit: 'px' as const } },
  { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' as const } },
  { id: 'link', label: 'Link', size: { width: 1200, height: 630, unit: 'px' as const } },
  { id: 'banner', label: 'Banner', size: { width: 1500, height: 500, unit: 'px' as const } },
  { id: 'a5', label: 'A5', size: { width: 148, height: 210, unit: 'mm' as const }, dpi: 300 },
];

interface Drawn {
  lines: string[];
  fontSize: string;
}

/** Lines and font size of the headline, as drawn by the one OutputRenderer. */
const readHeadline = (root: ReturnType<Page['locator']>) =>
  root.locator('[data-source-id=headline]').evaluate((el: HTMLElement): Drawn => ({
    lines: [...el.children].map((c) => c.textContent ?? ''),
    fontSize: el.style.fontSize,
  }));

describe.skipIf(!adminUrl)('S2 Khmer text parity: board = export worker', () => {
  let stack: Stack;
  let board: BrowserContext;
  let page: Page;
  let ids: { teamId: string; projectId: string };

  beforeAll(async () => {
    stack = await startStack();
    board = await stack.env.browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    page = await board.newPage();
    ids = await setupAndCreateProject(page, stack.env.webUrl, 'Parity');
  }, 120_000);
  afterAll(async () => {
    await board?.close();
    await stack?.close();
  });

  const projectUrl = () => `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;

  /** Only the headline is connected, so the canvas is transparent except for its glyphs. */
  async function showHeadline(h: (typeof HEADLINES)[number]) {
    const { rev, doc: current } = (await (await page.request.get(projectUrl())).json()) as { rev: number; doc: ProjectDoc };
    let doc: ProjectDoc = { ...current, outputs: [], wires: [] };
    doc = ok(connectSource(doc, 'headline'));
    const style: Partial<TextStyle> = { fontFamily: h.font, fontWeight: h.weight, fontSizePx: 140, maxLines: 3, language: 'auto' };
    doc = {
      ...doc,
      sources: doc.sources.map((s) => (s.id === 'headline' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: h.text, style: { ...s.content.style, ...style } } } : s)),
    };
    for (const o of OUTPUTS) doc = ok(addOutput(doc, o));
    expect((await page.request.put(projectUrl(), { data: { rev, doc } })).status()).toBe(200);
    await page.reload();
    for (const o of OUTPUTS) await page.getByLabel(`Output ${o.label}`, { exact: true }).locator('.sc-render [data-source-id=headline] > div').first().waitFor();
  }

  for (const [n, h] of HEADLINES.entries()) {
    it(`headline ${n + 1} (${h.font} ${h.weight}): same lines, word breaks, nothing clipped`, async () => {
      await showHeadline(h);
      for (const o of OUTPUTS) {
        const onScreen = await readHeadline(page.getByLabel(`Output ${o.label}`, { exact: true }).locator('.sc-render'));
        const render = await openRender(stack.env.browser, stack.env.webUrl, { ...ids, target: o.id, bleed: false, scale: 1 }, stack.api);
        try {
          const frame = render.locator(FRAME);
          const exported = await readHeadline(frame);
          expect(exported, `${o.id}: worker lines = board lines`).toEqual(onScreen);
          expect(exported.lines.join('').replace(/ /g, '')).toBe(h.text.replace(/ /g, ''));

          // Every break falls on a word boundary of the page's own Intl.Segmenter('km').
          const offWord = await render.evaluate(
            ({ text, lines }) => {
              const ends = new Set<number>();
              for (const { index, segment } of new Intl.Segmenter('km', { granularity: 'word' }).segment(text.replace(/ /g, ''))) ends.add(index + segment.length);
              let end = 0;
              return lines.slice(0, -1).filter((l) => !ends.has((end += l.replace(/ /g, '').length)));
            },
            { text: h.text, lines: exported.lines },
          );
          expect(offWord, `${o.id}: lines ending inside a word`).toEqual([]);

          // Glyph ink vs. the text box, on the transparent canvas.
          const geo = await frame.evaluate((f) => {
            const r = (e: Element) => e.getBoundingClientRect();
            const fr = r(f);
            const box = r(f.querySelector('[data-source-id=headline]') as Element);
            return { w: fr.width, h: fr.height, box: { x: box.x - fr.x, y: box.y - fr.y, w: box.width, h: box.height } };
          });
          const png = await frame.screenshot({ omitBackground: true });
          const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
          for (let y = 0; y < info.height; y++)
            for (let x = 0; x < info.width; x++)
              if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 8) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
          const { box } = geo;
          expect(x1, `${o.id}: something drawn`).toBeGreaterThan(0);
          expect(box.x >= 0 && box.y >= 0 && box.x + box.w <= geo.w + 0.5 && box.y + box.h <= geo.h + 0.5, `${o.id}: text box inside the canvas`).toBe(true);
          // Not clipped: all ink lies inside the canvas, with room to spare.
          expect(x0 >= 1 && y0 >= 1 && x1 < geo.w - 1 && y1 < geo.h - 1, `${o.id}: ink touches the canvas edge`).toBe(true);
          // Noto Sans Khmer's deep subscripts reach up to ~0.16em below the last line box (see the S2 report);
          // allow 0.2em so a font or line-height change that clips more fails here.
          const em = parseFloat(exported.fontSize);
          const ink = { left: x0 - box.x, top: y0 - box.y, right: box.x + box.w - (x1 + 1), bottom: box.y + box.h - (y1 + 1) };
          for (const [side, gap] of Object.entries(ink)) expect(gap, `${o.id}: ink past the ${side} of the text box`).toBeGreaterThanOrEqual(-0.2 * em);
        } finally {
          await render.close();
        }
      }
    }, 120_000);
  }
});

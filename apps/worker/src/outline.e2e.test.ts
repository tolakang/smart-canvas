/**
 * Spike S3 — SVG text outlines (O5). The same Khmer line drawn twice in Chromium: as live text with the
 * bundled web font (what the preview shows), and as HarfBuzz outlines placed on the live text's baseline.
 * Pass = same advance width, and every solid pixel of one lies within 1 px of an inked pixel of the other.
 * Results: docs/spikes/S3-SVG-OUTLINES.md.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOutlineFont, outlineLine, woffToSfnt } from './outline';
import { CHROMIUM_ARGS } from './render';

// The web app's bundled font files (the preview and the export page use these).
const web = createRequire(new URL('../../web/package.json', import.meta.url));
const fontFile = (path: string) => readFileSync(web.resolve(path));
/**
 * The package's own @font-face rules (one face per subset, each with its unicode-range): the CSS for the live
 * text with the woff2 files inlined, and the same faces for the outlines, last declared first.
 */
function loadFamily(pkg: string, weight: number) {
  const css = fontFile(`@fontsource/${pkg}/${weight}.css`).toString('utf8');
  const faces = [...css.matchAll(/url\(\.\/files\/([^)]+)\.woff2\)[^;]*;\s*unicode-range: ([^;]+);/g)].map(([, name = '', range = '']) =>
    loadOutlineFont(woffToSfnt(fontFile(`@fontsource/${pkg}/files/${name}.woff`)), range),
  );
  const live = css
    .replace(/font-family: '[^']+'/g, 'font-family: F')
    .replace(/src: url\(\.\/files\/([^)]+)\.woff2\)[^;]*;/g, (_, name: string) => `src: url(data:font/woff2;base64,${fontFile(`@fontsource/${pkg}/files/${name}.woff2`).toString('base64')});`);
  return { css: live, faces: faces.reverse() };
}

const FONTS = [
  { family: 'Noto Sans Khmer', pkg: 'noto-sans-khmer' },
  { family: 'Kantumruy Pro', pkg: 'kantumruy-pro' },
];
const TEXTS = ['សូមស្វាគមន៍មកកាន់ប្រទេសកម្ពុជា', 'ស្ត្រីខ្មែរស្រស់ស្អាត', 'ក្រុមហ៊ុនផ្គត់ផ្គង់គ្រឿង', 'ព្រឹត្តិការណ៍ ៥០% Grand opening'];
const SIZES = [24, 64, 140];

/** Alpha of each pixel. */
async function alpha(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = new Uint8Array(info.width * info.height);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3] ?? 0;
  return { a, w: info.width, h: info.height };
}
type Alpha = Awaited<ReturnType<typeof alpha>>;

// Solid ink vs. any ink: two anti-aliased renders of the same edge can sit either side of one cut-off
// (alpha 125 vs 128 on a thin stroke), so a single threshold would report a 1-level difference as a miss.
const SOLID = 160;
const ANY = 64;

/** Solid pixels of `a` with no inked pixel of `b` within 1 px (3×3 neighbourhood). */
function farPixels(a: Alpha, b: Alpha): number {
  let far = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      if ((a.a[y * a.w + x] ?? 0) <= SOLID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          near = yy >= 0 && xx >= 0 && yy < b.h && xx < b.w && (b.a[yy * b.w + xx] ?? 0) > ANY;
        }
      if (!near) far++;
    }
  return far;
}

describe('S3 SVG text outlines (harfbuzzjs)', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ args: CHROMIUM_ARGS });
    page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  for (const { family, pkg } of FONTS)
    for (const weight of [400, 700])
      it(`${family} ${weight}: outlines match live text within 1 px`, async () => {
        const { css, faces: outlines } = loadFamily(pkg, weight);
        expect(outlines.length).toBeGreaterThanOrEqual(3);
        for (const text of TEXTS)
          for (const px of SIZES) {
            const h = Math.ceil(px * 1.6);
            await page.setContent(`<style>
              ${css}
              body { margin: 0 } .box { position: absolute; left: 20px; top: 20px; width: 1360px; height: ${h}px }
            </style>
            <div id="live" class="box" style="font: ${px}px/1.6 F; font-weight: ${weight}; white-space: pre"><span id="run">${text}</span><span id="bl" style="display: inline-block; width: 0; height: 0"></span></div>`);
            await page.evaluate(async (t) => {
              await document.fonts.load(`${t.px}px F`, t.text);
              await document.fonts.ready;
            }, { px, text });
            const live = await page.evaluate(() => ({
              // Chromium draws the baseline on a whole pixel.
              baseline: Math.round((document.getElementById('bl') as HTMLElement).getBoundingClientRect().top - 20),
              width: (document.getElementById('run') as HTMLElement).getBoundingClientRect().width,
            }));
            const drawnLive = await alpha(await page.locator('#live').screenshot({ omitBackground: true }));

            const { svg, advance } = outlineLine(outlines, text, px);
            await page.setContent(`<style>body { margin: 0 } .box { position: absolute; left: 20px; top: 20px; width: 1360px; height: ${h}px }</style>
              <div id="out" class="box"><svg width="1360" height="${h}" style="display: block"><g transform="translate(0 ${live.baseline})">${svg}</g></svg></div>`);
            const drawnOut = await alpha(await page.locator('#out').screenshot({ omitBackground: true }));

            const what = `${text} @${px}px`;
            expect(Math.abs(advance - live.width), `${what}: advance`).toBeLessThan(0.1);
            expect(drawnLive.a.some((v) => v > SOLID), `${what}: live text drawn`).toBe(true);
            expect(farPixels(drawnLive, drawnOut), `${what}: live pixels > 1 px from the outlines`).toBe(0);
            expect(farPixels(drawnOut, drawnLive), `${what}: outline pixels > 1 px from the live text`).toBe(0);
          }
      }, 120_000);
});

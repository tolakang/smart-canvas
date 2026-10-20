/**
 * Outlined SVG text (T6.4, D23; method from spike S3). Each text layer of the ready render page becomes an
 * inline <svg> of glyph paths in place of its lines, so the layer order, frame and rotation stay those of
 * the one OutputRenderer. Lines, their start and their baseline are measured on the page; HarfBuzz shapes
 * each line with the faces the page itself uses (font stack → weight → unicode-range).
 * A layer that can't be outlined (no TTF/OTF/WOFF source for a face it needs, or a glyph no face covers)
 * stays live text, with its font embedded as usual.
 */
import type { Page } from 'playwright';
import { FRAME } from './render';
import { fontRuns, loadOutlineFont, outlineLine, woffToSfnt, type OutlineFont } from './outline';

interface FaceRule {
  family: string;
  /** Lowest and highest weight the face is declared for. */
  weights: [number, number];
  unicodeRange: string;
  /** Absolute URLs with their declared format, in src order. */
  srcs: { url: string; format: string }[];
}

interface TextLayer {
  families: string[];
  weight: number;
  fontPx: number;
  letterSpacingPx: number;
  color: string;
  lines: { text: string; x: number; baseline: number }[] | null;
}

/** Text layers in document order (same order as `[data-kind="text"]` in a clone of the frame). */
async function readPage(page: Page): Promise<{ layers: TextLayer[]; faces: FaceRule[] }> {
  return page.locator(FRAME).first().evaluate((frame) => {
    const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '');
    const layers = [...frame.querySelectorAll<HTMLElement>('[data-kind="text"]')].map((el) => {
      const cs = getComputedStyle(el);
      const lineEls = [...el.children] as HTMLElement[];
      // Measure without the layer's rotation; the canvas scale is uniform, so divide it out.
      const saved = el.style.transform;
      el.style.transform = 'none';
      const box = el.getBoundingClientRect();
      const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
      const lines = lineEls.length
        ? lineEls.map((line) => {
            const mark = document.createElement('span');
            mark.style.cssText = 'display: inline-block; width: 0; height: 0';
            line.prepend(mark);
            const r = mark.getBoundingClientRect();
            mark.remove();
            return { text: line.textContent ?? '', x: (r.left - box.left) / scale, baseline: (r.top - box.top) / scale };
          })
        : null;
      el.style.transform = saved;
      return {
        families: cs.fontFamily.split(',').map(unquote),
        weight: Number(cs.fontWeight) || 400,
        fontPx: parseFloat(cs.fontSize),
        letterSpacingPx: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
        color: cs.color,
        lines,
      };
    });
    const faces: FaceRule[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const s = rule.style;
        const w = s.getPropertyValue('font-weight').trim().split(/\s+/).map(Number);
        const lo = w[0] || 400;
        const srcs = [...s.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)(?:\s*format\(["']?([^"')]+)["']?\))?/g)].map((m) => ({
          url: new URL(m[1] ?? '', sheet.href ?? document.baseURI).href,
          format: (m[2] ?? '').toLowerCase(),
        }));
        faces.push({ family: unquote(s.getPropertyValue('font-family')), weights: [lo, w[1] || lo], unicodeRange: s.getPropertyValue('unicode-range').trim(), srcs });
      }
    }
    return { layers, faces };
  });
}

/** CSS font matching, simplified: an exact weight, else the nearest declared one. */
function facesFor(all: FaceRule[], family: string, weight: number): FaceRule[] {
  const own = all.filter((f) => f.family === family);
  if (!own.length) return [];
  const dist = (f: FaceRule) => (weight < f.weights[0] ? f.weights[0] - weight : weight > f.weights[1] ? weight - f.weights[1] : 0);
  const best = Math.min(...own.map(dist));
  // CSS tries the last declared face first.
  return own.filter((f) => dist(f) === best).reverse();
}

const isSfnt = (b: Buffer) => b.readUInt32BE(0) === 0x00010000 || b.subarray(0, 4).toString('latin1') === 'true' || b.subarray(0, 4).toString('latin1') === 'OTTO';

/** Outline markup per text layer (null = keep live text). */
export async function outlineTextLayers(page: Page): Promise<(string | null)[]> {
  const { layers, faces } = await readPage(page);
  const loaded = new Map<FaceRule, Promise<OutlineFont | null>>();
  const load = (face: FaceRule) => {
    let p = loaded.get(face);
    if (!p) {
      p = (async () => {
        // HarfBuzz needs TTF/OTF; WOFF 1.0 unpacks to it. WOFF2 has no decoder here.
        for (const { url, format } of face.srcs) {
          if (format === 'woff2' || /\.woff2(\?|$)/.test(url)) continue;
          const b64 = await page.evaluate(async (u) => {
            const res = await fetch(u).catch(() => null);
            if (!res?.ok) return null;
            const bytes = new Uint8Array(await res.arrayBuffer());
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return btoa(bin);
          }, url);
          if (!b64) continue;
          const bytes = Buffer.from(b64, 'base64');
          if (bytes.subarray(0, 4).toString('latin1') === 'wOFF') return loadOutlineFont(woffToSfnt(bytes), face.unicodeRange || undefined);
          if (isSfnt(bytes)) return loadOutlineFont(bytes, face.unicodeRange || undefined);
        }
        return null;
      })();
      loaded.set(face, p);
    }
    return p;
  };

  const out: (string | null)[] = [];
  for (const layer of layers) {
    if (!layer.lines) {
      out.push(null);
      continue;
    }
    const usable: OutlineFont[] = [];
    for (const family of layer.families) for (const face of facesFor(faces, family, layer.weight)) {
      const f = await load(face);
      if (f) usable.push(f);
    }
    // Every grapheme needs a face (no .notdef boxes, no silent fallback to a font we can't outline).
    const covered = usable.length > 0 && layer.lines.every((l) => fontRuns(usable, l.text).every((run) => [...run.text].every((c) => run.font.covers(c.codePointAt(0) ?? 0))));
    if (!covered) {
      out.push(null);
      continue;
    }
    const paths = layer.lines
      .map((l) => `<g transform="translate(${l.x} ${l.baseline})">${outlineLine(usable, l.text, layer.fontPx, layer.letterSpacingPx).svg}</g>`)
      .join('');
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position: absolute; left: 0; top: 0; overflow: visible" fill="${layer.color}">${paths}</svg>`);
  }
  return out;
}

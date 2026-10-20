/**
 * Font loading for the board, the renderer and the export page (D3).
 * Rule (CLAUDE.md): never measure text before its fonts are loaded. `prepareTextMeasure` is the only way
 * to get a TextMeasure, and it awaits `document.fonts.load` for every family/weight/text first.
 * The text matters: bundled families are split by unicode-range, so loading without the Khmer
 * characters would never fetch the Khmer face.
 */
import { cssFont, quoteFamily, type TextMeasure, type TextStyle } from '@smart-canvas/core';
import { assetUrl } from '../api';

export interface TeamFont {
  id: string;
  family: string;
  mime: string;
}

const registered = new Set<string>();

/**
 * Adds team fonts as @font-face rules (once each) in one <style>, like the bundled fonts' CSS, so every
 * consumer (renderer, measuring, the SVG export's font embedding) sees one kind of font. Faces load
 * lazily when first used or prepared.
 */
export function registerTeamFonts(teamId: string, fonts: TeamFont[]): void {
  let sheet = document.getElementById('sc-team-fonts');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'sc-team-fonts';
    document.head.append(sheet);
  }
  for (const f of fonts) {
    if (registered.has(f.id) || !f.family) continue;
    // One uploaded file covers every weight request, so the browser does not fake bold over it.
    sheet.append(`@font-face{font-family:${quoteFamily(f.family)};src:url("${assetUrl(teamId, f.id)}");font-weight:100 900;font-display:swap}\n`);
    registered.add(f.id);
  }
}

export interface FontRequest {
  style: Pick<TextStyle, 'fontFamily' | 'fontWeight'>;
  text: string;
}

/** Loads the faces each request needs; resolves with the requests that matched no loaded face. */
export async function ensureFonts(requests: FontRequest[]): Promise<FontRequest[]> {
  const results = await Promise.all(
    requests.map(async (r) => {
      try {
        const faces = await document.fonts.load(cssFont(r.style, 16), r.text || ' ');
        return faces.length > 0 ? null : r;
      } catch {
        return r;
      }
    }),
  );
  return results.filter((r): r is FontRequest => r !== null);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Synchronous canvas measure. Only valid after the fonts are loaded; use prepareTextMeasure. */
function canvasMeasure(): TextMeasure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return (text, fontPx, style) => {
    const shown = style.textTransform === 'uppercase' ? text.toUpperCase() : text;
    ctx.font = cssFont(style, fontPx);
    const spacing = (style.letterSpacingEm ?? 0) * fontPx * [...graphemes.segment(shown)].length;
    return ctx.measureText(shown).width + spacing;
  };
}

/** Loads fonts for `requests`, then returns a TextMeasure for the layout engine. */
export async function prepareTextMeasure(requests: FontRequest[]): Promise<{ measure: TextMeasure; missing: FontRequest[] }> {
  const missing = await ensureFonts(requests);
  return { measure: canvasMeasure(), missing };
}

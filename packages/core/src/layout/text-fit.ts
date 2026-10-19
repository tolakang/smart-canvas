/**
 * text behaviour: greedy word wrap and fit-to-box (ADAPTATION-RULES "text").
 * Khmer breaks only at Intl.Segmenter('km') word boundaries; Latin at spaces. A single word wider
 * than the box falls back to grapheme breaks. Measuring is injected (TextMeasure); never done here.
 */
import type { TextMeasure } from '../fonts';
import { DEFAULTS, type TextStyle } from '../model';
import { isKhmerText, lineHeightOf } from '../text';

const EPS = 1e-6;
const khmerWords = new Intl.Segmenter('km', { granularity: 'word' });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Break opportunities of one paragraph; trailing whitespace stays on the unit before it. */
function units(paragraph: string, khmer: boolean): string[] {
  if (!khmer) return paragraph.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = [];
  for (const { segment } of khmerWords.segment(paragraph)) {
    if (out.length > 0 && /^\s+$/.test(segment)) out[out.length - 1] += segment;
    else out.push(segment);
  }
  return out;
}

/** Lines of `text` at `fontPx` no wider than `maxWidth` (design px). Hard breaks (\n) are kept. */
export function breakLines(text: string, maxWidth: number, fontPx: number, style: TextStyle, measure: TextMeasure): string[] {
  const khmer = isKhmerText(style, text);
  const fits = (s: string) => measure(s.trimEnd(), fontPx, style) <= maxWidth + EPS;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const place = (unit: string) => {
      if (fits(unit)) {
        line = unit;
        return;
      }
      // One word wider than the box: break between graphemes.
      for (const { segment } of graphemes.segment(unit)) {
        if (line && !fits(line + segment)) {
          lines.push(line.trimEnd());
          line = '';
        }
        line += segment;
      }
    };
    for (const unit of units(paragraph, khmer)) {
      if (!line) place(unit);
      else if (fits(line + unit)) line += unit;
      else {
        lines.push(line.trimEnd());
        line = '';
        place(unit);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export interface TextFit {
  fontSizePx: number;
  lines: string[];
  overflow: boolean;
}

/** Wraps at a given size and reports whether it breaks the maxLines / box-height limits. */
export function wrapAt(text: string, style: TextStyle, box: { w: number; h: number }, fontPx: number, measure: TextMeasure): TextFit {
  const lines = text ? breakLines(text, box.w, fontPx, style, measure) : [];
  const height = lines.length * fontPx * lineHeightOf(style, text);
  return { fontSizePx: fontPx, lines, overflow: lines.length > Math.max(1, style.maxLines) || height > box.h + EPS };
}

/** Largest size on the 0.5 px grid, ≤ `startPx` and ≥ minFontPx, that fits; else minFontPx with overflow. */
export function fitText(text: string, style: TextStyle, box: { w: number; h: number }, startPx: number, measure: TextMeasure): TextFit {
  const step = DEFAULTS.fontStepPx;
  const min = DEFAULTS.minFontPx;
  for (let n = Math.floor(startPx / step + EPS); n * step >= min - EPS; n--) {
    const fit = wrapAt(text, style, box, n * step, measure);
    if (!fit.overflow) return fit;
  }
  return wrapAt(text, style, box, min, measure);
}

/** Snaps a size down onto the font grid, not below minFontPx. */
export function gridSize(px: number): number {
  const step = DEFAULTS.fontStepPx;
  return Math.max(DEFAULTS.minFontPx, Math.floor(px / step + EPS) * step);
}

/** Text helpers shared by the renderer and (later) the text-fit engine. Pure: Intl only, no DOM. */
import type { TextStyle } from './model';
import { LINE_HEIGHT } from './rules.config';

const KHMER = /[ក-៿᧠-᧿]/;

/** Khmer when the style says so, or (language auto/unset) when the text contains Khmer characters. */
export function isKhmerText(style: Pick<TextStyle, 'language'>, text: string): boolean {
  if (style.language === 'km') return true;
  if (style.language === 'en') return false;
  return KHMER.test(text);
}

export function lineHeightOf(style: Pick<TextStyle, 'lineHeight' | 'language'>, text: string): number {
  return style.lineHeight ?? (isKhmerText(style, text) ? LINE_HEIGHT.khmer : LINE_HEIGHT.latin);
}

const ZWSP = '​';

/**
 * Marks Khmer word boundaries with zero-width spaces so a browser that wraps on its own only breaks
 * between words (CLAUDE.md: Intl.Segmenter('km')). Used when the engine has not supplied explicit lines.
 */
export function withKhmerBreaks(text: string): string {
  if (!KHMER.test(text)) return text;
  const words = new Intl.Segmenter('km', { granularity: 'word' }).segment(text);
  let out = '';
  let prevKhmer = false;
  for (const { segment } of words) {
    const khmer = KHMER.test(segment);
    if (out && khmer && prevKhmer) out += ZWSP;
    out += segment;
    prevKhmer = khmer;
  }
  return out;
}

export function applyTransform(text: string, style: Pick<TextStyle, 'textTransform'>): string {
  return style.textTransform === 'uppercase' ? text.toUpperCase() : text;
}

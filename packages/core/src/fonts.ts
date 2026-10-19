/**
 * Fonts shared by the board, the renderer and the export worker (D3: same fonts everywhere).
 * Bundled families ship with the web app; team fonts are uploaded assets.
 */
import type { TextStyle } from './model';

/** Width of `text` in design px at `fontPx` (ADAPTATION-RULES). Injected into the engine; never measured in core. */
export type TextMeasure = (text: string, fontPx: number, style: TextStyle) => number;

export interface BundledFont {
  family: string;
  weights: readonly number[];
  scripts: readonly ('latin' | 'khmer')[];
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: 'Noto Sans', weights: [400, 700], scripts: ['latin'] },
  { family: 'Noto Sans Khmer', weights: [400, 700], scripts: ['khmer', 'latin'] },
  { family: 'Kantumruy Pro', weights: [400, 700], scripts: ['khmer', 'latin'] },
];

/** Bundled fallbacks so Khmer always has glyphs, whatever family the text asks for. */
export const FALLBACK_FAMILIES = ['Noto Sans Khmer', 'Noto Sans'] as const;

/** CSS-quoted family name (quotes and backslashes escaped; control characters dropped). */
export function quoteFamily(family: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = family.replace(/[\u0000-\u001f\u007f]/g, '').replace(/["\\]/g, (c) => `\\${c}`);
  return `"${clean}"`;
}

/** CSS font-family list: the chosen family, then the bundled Khmer and Latin fallbacks. */
export function fontStack(family: string): string {
  const families = [family, ...FALLBACK_FAMILIES.filter((f) => f !== family)];
  return [...families.map(quoteFamily), 'sans-serif'].join(', ');
}

/** CSS `font` shorthand for a style at a size (canvas ctx.font and document.fonts.load). */
export function cssFont(style: Pick<TextStyle, 'fontFamily' | 'fontWeight'>, fontPx: number): string {
  return `${style.fontWeight} ${fontPx}px ${fontStack(style.fontFamily)}`;
}

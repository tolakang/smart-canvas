/** Editing a text source's style (T3.4). Values are clamped so a bad input can't break layout or export. */
import { DEFAULTS, type ProjectDoc, type TextStyle } from './model';
import type { SourceResult } from './sources';

export const TEXT_LIMITS = {
  minFontPx: DEFAULTS.minFontPx,
  maxFontPx: 4000,
  maxLines: 20,
  minLineHeight: 0.5,
  maxLineHeight: 4,
  weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] as const,
} as const;

/** A patch; `lineHeight: null` means "back to auto" (1.2 latin / 1.6 khmer). */
export type TextStylePatch = Partial<Omit<TextStyle, 'lineHeight'>> & { lineHeight?: number | null };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const HEX = /^#[0-9a-f]{6}$/i;

export function applyTextStylePatch(style: TextStyle, patch: TextStylePatch): TextStyle {
  const next: TextStyle = { ...style };
  if (patch.fontFamily !== undefined && patch.fontFamily.trim()) next.fontFamily = patch.fontFamily.trim().slice(0, 200);
  if (patch.fontSizePx !== undefined && Number.isFinite(patch.fontSizePx)) {
    next.fontSizePx = Math.round(clamp(patch.fontSizePx, TEXT_LIMITS.minFontPx, TEXT_LIMITS.maxFontPx) * 2) / 2; // 0.5 px grid
  }
  if (patch.fontWeight !== undefined && Number.isFinite(patch.fontWeight)) {
    next.fontWeight = clamp(Math.round(patch.fontWeight / 100) * 100, 100, 900);
  }
  if (patch.color !== undefined && HEX.test(patch.color)) next.color = patch.color.toLowerCase();
  if (patch.align !== undefined && ['left', 'center', 'right'].includes(patch.align)) next.align = patch.align;
  if (patch.maxLines !== undefined && Number.isFinite(patch.maxLines)) next.maxLines = clamp(Math.round(patch.maxLines), 1, TEXT_LIMITS.maxLines);
  if (patch.lineHeight === null) delete next.lineHeight;
  else if (patch.lineHeight !== undefined && Number.isFinite(patch.lineHeight)) {
    next.lineHeight = Math.round(clamp(patch.lineHeight, TEXT_LIMITS.minLineHeight, TEXT_LIMITS.maxLineHeight) * 100) / 100;
  }
  if (patch.language !== undefined && ['auto', 'km', 'en'].includes(patch.language)) next.language = patch.language;
  if (patch.textTransform !== undefined && ['none', 'uppercase'].includes(patch.textTransform)) next.textTransform = patch.textTransform;
  if (patch.letterSpacingEm !== undefined && Number.isFinite(patch.letterSpacingEm)) next.letterSpacingEm = clamp(patch.letterSpacingEm, -0.2, 1);
  return next;
}

export function setTextStyle(doc: ProjectDoc, sourceId: string, patch: TextStylePatch): SourceResult {
  const source = doc.sources.find((s) => s.id === sourceId);
  if (!source) return { ok: false, error: 'not_found' };
  if (source.content.kind !== 'text') return { ok: false, error: 'bad_behavior' };
  const content = { ...source.content, style: applyTextStylePatch(source.content.style, patch) };
  return { ok: true, doc: { ...doc, sources: doc.sources.map((s) => (s.id === sourceId ? { ...s, content } : s)) } };
}

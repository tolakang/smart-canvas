import { describe, expect, it } from 'vitest';
import { createProjectDoc } from './project';
import { DEFAULT_TEXT_STYLE } from './sources';
import { applyTextStylePatch, setTextStyle, TEXT_LIMITS } from './text-style';

describe('text style edits (T3.4)', () => {
  it('applies each field', () => {
    const s = applyTextStylePatch(DEFAULT_TEXT_STYLE, {
      fontFamily: 'Kantumruy Pro',
      fontSizePx: 96,
      fontWeight: 400,
      color: '#FF0000',
      align: 'left',
      maxLines: 3,
      lineHeight: 1.35,
      language: 'km',
    });
    expect(s).toMatchObject({ fontFamily: 'Kantumruy Pro', fontSizePx: 96, fontWeight: 400, color: '#ff0000', align: 'left', maxLines: 3, lineHeight: 1.35, language: 'km' });
  });

  it('clamps sizes, weights, lines and line height; ignores invalid values', () => {
    const s = applyTextStylePatch(DEFAULT_TEXT_STYLE, { fontSizePx: 3, fontWeight: 650, maxLines: 0, lineHeight: 9, color: 'red', align: 'justify' as never });
    expect(s.fontSizePx).toBe(TEXT_LIMITS.minFontPx);
    expect(s.fontWeight).toBe(700);
    expect(s.maxLines).toBe(1);
    expect(s.lineHeight).toBe(TEXT_LIMITS.maxLineHeight);
    expect(s.color).toBe(DEFAULT_TEXT_STYLE.color);
    expect(s.align).toBe(DEFAULT_TEXT_STYLE.align);
    expect(applyTextStylePatch(DEFAULT_TEXT_STYLE, { fontSizePx: 99.3 }).fontSizePx).toBe(99.5); // 0.5 px grid
    expect(applyTextStylePatch(DEFAULT_TEXT_STYLE, { fontFamily: '   ' }).fontFamily).toBe(DEFAULT_TEXT_STYLE.fontFamily);
  });

  it('null line height goes back to auto', () => {
    const custom = applyTextStylePatch(DEFAULT_TEXT_STYLE, { lineHeight: 1.4 });
    expect(applyTextStylePatch(custom, { lineHeight: null })).not.toHaveProperty('lineHeight');
  });

  it('only edits text sources', () => {
    const doc = createProjectDoc('P');
    const r = setTextStyle(doc, 'headline', { fontSizePx: 200 });
    expect(r.ok && r.doc.sources.find((s) => s.id === 'headline')?.content).toMatchObject({ style: { fontSizePx: 200 } });
    expect(setTextStyle(doc, 'logo', { fontSizePx: 200 })).toEqual({ ok: false, error: 'bad_behavior' });
    expect(setTextStyle(doc, 'nope', {})).toEqual({ ok: false, error: 'not_found' });
  });
});

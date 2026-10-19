import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_STYLE } from '../sources';
import type { TextStyle } from '../model';
import { breakLines, fitText } from './text-fit';
import { mockMeasure } from './test-doc';

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...DEFAULT_TEXT_STYLE, fontSizePx: 200, ...patch });
const E = 'AAAAA BBBBB CCCCC DDDDD EEEEE';

describe('breakLines', () => {
  it('wraps Latin greedily at spaces', () => {
    expect(breakLines(E, 864, 72, style(), mockMeasure)).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']);
    expect(breakLines(E, 10000, 72, style(), mockMeasure)).toEqual([E]);
  });

  it('keeps hard line breaks', () => {
    expect(breakLines('AB\nCD', 1000, 10, style(), mockMeasure)).toEqual(['AB', 'CD']);
  });

  it('breaks a word wider than the box between graphemes', () => {
    expect(breakLines('ABCDEFGH IJ', 40, 20, style(), mockMeasure)).toEqual(['ABCD', 'EFGH', 'IJ']);
  });

  it('breaks Khmer only at word boundaries', () => {
    const text = 'សួស្តីពិភពលោកនេះស្អាតណាស់';
    const words = [...new Intl.Segmenter('km', { granularity: 'word' }).segment(text)].map((s) => s.segment);
    expect(words.length).toBeGreaterThan(2);
    const boundaries = new Set(words.map((_, i) => words.slice(0, i + 1).join('').length));
    const widest = Math.max(...words.map((w) => w.length));
    const lines = breakLines(text, (widest + 1) * 0.5 * 10, 10, style(), mockMeasure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
    let end = 0;
    for (const line of lines) expect(boundaries.has((end += line.length))).toBe(true);
  });
});

describe('fitText (example E, mock measure)', () => {
  const box = { w: 864, h: 225 };

  it('maxLines 2 → 72 px, 2 lines', () => {
    const fit = fitText(E, style({ maxLines: 2 }), box, 72, mockMeasure);
    expect(fit).toEqual({ fontSizePx: 72, lines: ['AAAAA BBBBB CCCCC DDDDD', 'EEEEE'], overflow: false });
    expect(2 * 72 * 1.2).toBeCloseTo(172.8);
  });

  it('maxLines 1 → 59.5 px, 1 line', () => {
    expect(fitText(E, style({ maxLines: 1 }), box, 72, mockMeasure)).toEqual({ fontSizePx: 59.5, lines: [E], overflow: false });
  });

  it('shrinks for the box height too', () => {
    // 3 lines needed at 72; box only allows 2 lines of 72·1.2
    const fit = fitText(E, style({ maxLines: 5 }), { w: 500, h: 180 }, 72, mockMeasure);
    expect(fit.lines.length * fit.fontSizePx * 1.2).toBeLessThanOrEqual(180);
    expect(fit.overflow).toBe(false);
  });

  it('falls back to minFontPx with overflow when nothing fits', () => {
    expect(fitText(E, style({ maxLines: 1 }), { w: 50, h: 1000 }, 72, mockMeasure)).toMatchObject({ fontSizePx: 12, overflow: true });
  });

  it('starts on the 0.5 grid at or below the start size', () => {
    expect(fitText('A', style(), box, 30.3, mockMeasure).fontSizePx).toBe(30);
  });
});

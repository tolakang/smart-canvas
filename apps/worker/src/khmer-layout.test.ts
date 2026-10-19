/**
 * Khmer text fit with real font metrics (T4.5): the bundled Noto Sans Khmer face, measured with fontkit,
 * through the same layout engine the preview and export use. Lines must break only between words.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { create, type Font } from 'fontkit';
import { describe, expect, it } from 'vitest';
import { breakLines, computeLayout, createProjectDoc, connectSource, DEFAULT_TEXT_STYLE, type ProjectDoc, type TextMeasure } from '@smart-canvas/core';

const require = createRequire(import.meta.url);
const fontFile = (weight: number) => require.resolve(`@fontsource/noto-sans-khmer/files/noto-sans-khmer-khmer-${weight}-normal.woff2`);
const fonts = new Map<number, Font>([400, 700].map((w) => [w, create(readFileSync(fontFile(w))) as Font]));

/** Advance width of the shaped run, in design px. */
const measure: TextMeasure = (text, fontPx, style) => {
  const font = fonts.get(style.fontWeight) ?? fonts.get(400);
  if (!font) throw new Error('font missing');
  return (font.layout(text).advanceWidth / font.unitsPerEm) * fontPx;
};

const segmenter = new Intl.Segmenter('km', { granularity: 'word' });
const wordEnds = (text: string) => {
  const ends = new Set<number>();
  for (const { index, segment } of segmenter.segment(text)) ends.add(index + segment.length);
  return ends;
};

// "Welcome to Cambodia, the kingdom of wonder" — no spaces, as Khmer is usually written.
const TEXT = 'សូមស្វាគមន៍មកកាន់ប្រទេសកម្ពុជាព្រះរាជាណាចក្រនៃភាពអស្ចារ្យ';
const style = { ...DEFAULT_TEXT_STYLE, fontFamily: 'Noto Sans Khmer', language: 'km' as const, fontSizePx: 160, maxLines: 3 };

describe('Khmer layout with real metrics', () => {
  it('measures Khmer clusters as non-zero widths', () => {
    expect(measure('ក', 100, style)).toBeGreaterThan(10);
    expect(measure(TEXT, 100, style)).toBeGreaterThan(measure('ក', 100, style) * 10);
  });

  it('breaks only at Intl.Segmenter word boundaries, every line inside the box', () => {
    const ends = wordEnds(TEXT);
    const width = measure(TEXT, 60, style) / 3.2;
    const lines = breakLines(TEXT, width, 60, style, measure);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join('')).toBe(TEXT);
    let end = 0;
    for (const line of lines) {
      expect(measure(line, 60, style)).toBeLessThanOrEqual(width + 1e-6);
      end += line.length;
      expect(ends.has(end), `break after "${line}"`).toBe(true);
    }
  });

  it('fits a Khmer headline in an output with the 1.6 Khmer line height', () => {
    let doc: ProjectDoc = createProjectDoc('P');
    const r = connectSource(doc, 'headline');
    if (!r.ok) throw new Error(r.error);
    doc = {
      ...r.doc,
      sources: r.doc.sources.map((s) => (s.id === 'headline' ? { ...s, content: { kind: 'text', text: TEXT, style } } : s)),
      outputs: [{ id: 'o1', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' }, family: 'auto', overrides: [], board: { x: 0, y: 0 } }],
    };
    const item = computeLayout(doc, 'o1', { measure, assets: {} }).items.find((i) => i.sourceId === 'headline');
    expect(item?.lines?.length).toBeGreaterThan(0);
    expect(item?.lines?.length).toBeLessThanOrEqual(3);
    expect(item?.warnings).toEqual([]);
    const size = item?.fontSizePx ?? 0;
    expect(size).toBeLessThanOrEqual(160 * 0.36);
    expect(size % 0.5).toBe(0);
    const frame = item?.frame;
    expect((item?.lines?.length ?? 0) * size * 1.6).toBeLessThanOrEqual((frame?.h ?? 0) + 1e-6);
    const ends = wordEnds(TEXT);
    let end = 0;
    for (const line of item?.lines ?? []) {
      expect(measure(line, size, style)).toBeLessThanOrEqual((frame?.w ?? 0) + 1e-6);
      expect(ends.has((end += line.length))).toBe(true);
    }
  });
});

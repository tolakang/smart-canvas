import { describe, expect, it } from 'vitest';
import type { Override, ProjectDoc, TextStyle } from '../model';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const E = 'AAAAA BBBBB CCCCC DDDDD EEEEE';
const headlineFrame = { x: 300, y: 300, w: 2400, h: 500 };

function headline(doc: ProjectDoc, text: string, patch: Partial<TextStyle> = {}): ProjectDoc {
  return {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'headline' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text, style: { ...s.content.style, fontSizePx: 200, ...patch } } } : s,
    ),
  };
}
const item = (doc: ProjectDoc) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === 'headline');
const exampleE = (maxLines: number, overrides: Override[] = []) =>
  headline(place(project(output({ overrides })), 'headline', headlineFrame), E, { maxLines });
const ov = (patch: Partial<Override>): Override => ({ sourceId: 'headline', updatedBy: 'u', updatedAt: '2026-01-01T00:00:00Z', ...patch });

describe('text (example E, v2: in a group with the default subject)', () => {
  // U = {300,300,2400,1860}; c = px = 972/2400 = 0.405; py = 1242/1860; f0 = 200·c = 81
  it('maxLines 2 → 81 px on 2 lines in a 972×202.5 box at the spread centre', () => {
    const r = item(exampleE(2));
    expect(r?.fontSizePx).toBe(81);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']);
    expect(r?.warnings).toEqual([]);
    expectFrame(r?.frame, { x: 54, y: 119.685484, w: 972, h: 202.5 });
  });

  it('maxLines 1 → 67 px on 1 line', () => {
    const r = item(exampleE(1));
    expect(r?.fontSizePx).toBe(67); // 29·0.5·f ≤ 972
    expect(r?.lines).toEqual([E]);
  });
});

describe('text', () => {
  it('caps the box width at the safe rect', () => {
    const doc = headline(place(project(), 'headline', { x: 0, y: 1000, w: 3000, h: 500 }), 'A');
    expect(item(doc)?.frame.w).toBeCloseTo(972);
    expect(item(doc)?.frame.x).toBeCloseTo(54);
  });

  it('the group spread lands an edge text on the edge of S, without clamping', () => {
    const r = item(headline(place(project(), 'headline', { x: 0, y: 0, w: 1500, h: 300 }), 'A'));
    expectFrame(r?.frame, { x: 54, y: 79.5, w: 607.5, h: 121.5 });
    expect(r?.warnings).toEqual([]);
  });

  it('uses minFontPx and warns when nothing fits', () => {
    const r = item(headline(place(project(), 'headline', { x: 1400, y: 1400, w: 200, h: 200 }), E, { maxLines: 1 }));
    expect(r?.fontSizePx).toBe(12);
    expect(r?.warnings).toEqual(['text-overflow']);
  });

  it('override fontSizePx is used as-is (no fit)', () => {
    const r = item(exampleE(1, [ov({ style: { fontSizePx: 80 } })]));
    expect(r?.fontSizePx).toBe(80);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']); // 2 lines > maxLines 1 in the 972 box
    expect(r?.warnings).toEqual(['text-overflow']);
    expect(r?.overridden).toBe(true);
  });

  it('override frame: fit runs inside it', () => {
    const r = item(exampleE(1, [ov({ frame: { x: 10, w: 290 } })]));
    expect(r?.frame).toMatchObject({ x: 10, w: 290 });
    expect(r?.fontSizePx).toBe(20); // 29·0.5·f ≤ 290
    expect(r?.lines).toEqual([E]);
  });

  it('override style fields restyle the fit', () => {
    expect(item(exampleE(2, [ov({ style: { maxLines: 1 } })]))?.fontSizePx).toBe(67);
  });

  it('empty text has no lines and no warnings', () => {
    const r = item(headline(place(project(), 'headline', headlineFrame), ''));
    expect(r?.lines).toEqual([]);
    expect(r?.warnings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { Override, ProjectDoc, TextStyle } from '../model';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const E = 'AAAAA BBBBB CCCCC DDDDD EEEEE';
const G = Math.sqrt(0.36 * 0.45); // grid scale on 1080×1350
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

describe('text (example E, v3: its box on the stretched grid)', () => {
  // box: 2400×500 · G = 965.98×201.25, centred across (centre x 0.5), top edge at 300/3000 · 1350; f0 = 200·G = 80.5
  it('maxLines 2 → 80 px on 2 lines in a 965.98×201.25 box', () => {
    const r = item(exampleE(2));
    expect(r?.fontSizePx).toBe(80);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']);
    expect(r?.warnings).toEqual([]);
    expectFrame(r?.frame, { x: 540 - 1200 * G, y: 135, w: 2400 * G, h: 500 * G });
  });

  it('maxLines 1 → 66.5 px on 1 line', () => {
    const r = item(exampleE(1));
    expect(r?.fontSizePx).toBe(66.5); // 29·0.5·f ≤ 965.98
    expect(r?.lines).toEqual([E]);
  });
});

describe('text', () => {
  it('a box spanning the master fills the output width', () => {
    const doc = headline(place(project(), 'headline', { x: 0, y: 1000, w: 3000, h: 500 }), 'A');
    expectFrame(item(doc)?.frame, { x: 0, y: 450, w: 1080, h: 225 }); // edge to edge across: the box stretches with the grid (sx 0.36, sy 0.45)
  });

  it('a text in the top-left keeps its top-left corner on the grid', () => {
    const r = item(headline(place(project(), 'headline', { x: 0, y: 0, w: 1500, h: 300 }), 'A'));
    expectFrame(r?.frame, { x: 0, y: 0, w: 1500 * G, h: 300 * G });
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
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']); // 2 lines > maxLines 1 in the 965.98 box
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
    expect(item(exampleE(2, [ov({ style: { maxLines: 1 } })]))?.fontSizePx).toBe(66.5);
  });

  it('empty text has no lines and no warnings', () => {
    const r = item(headline(place(project(), 'headline', headlineFrame), ''));
    expect(r?.lines).toEqual([]);
    expect(r?.warnings).toEqual([]);
  });
});

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

describe('text (example E)', () => {
  it('maxLines 2 → 72 px on 2 lines in an 864×225 box', () => {
    const r = item(exampleE(2));
    expect(r?.fontSizePx).toBe(72);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']);
    expect(r?.warnings).toEqual([]);
    // box centred on the master anchor (0.5, 550/3000)
    expectFrame(r?.frame, { x: 540 - 432, y: (550 / 3000) * 1350 - 112.5, w: 864, h: 225 });
  });

  it('maxLines 1 → 59.5 px on 1 line', () => {
    const r = item(exampleE(1));
    expect(r?.fontSizePx).toBe(59.5);
    expect(r?.lines).toEqual([E]);
  });
});

describe('text', () => {
  it('caps the box width at the safe rect', () => {
    const doc = headline(place(project(), 'headline', { x: 0, y: 1000, w: 3000, h: 500 }), 'A');
    expect(item(doc)?.frame.w).toBeCloseTo(972);
    expect(item(doc)?.frame.x).toBeCloseTo(54);
  });

  it('clamps the box into the safe rect', () => {
    const r = item(headline(place(project(), 'headline', { x: 0, y: 0, w: 1500, h: 300 }), 'A'));
    expectFrame(r?.frame, { x: 54, y: 54, w: 540, h: 135 });
    expect(r?.warnings).toEqual(['clamped']);
  });

  it('uses minFontPx and warns when nothing fits', () => {
    const r = item(headline(place(project(), 'headline', { x: 1400, y: 1400, w: 200, h: 200 }), E, { maxLines: 1 }));
    expect(r?.fontSizePx).toBe(12);
    expect(r?.warnings).toEqual(['text-overflow']);
  });

  it('override fontSizePx is used as-is (no fit)', () => {
    const r = item(exampleE(1, [ov({ style: { fontSizePx: 80 } })]));
    expect(r?.fontSizePx).toBe(80);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC', 'DDDDD EEEEE']); // 2 lines > maxLines 1
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
    expect(item(exampleE(2, [ov({ style: { maxLines: 1 } })]))?.fontSizePx).toBe(59.5);
  });

  it('empty text has no lines and no warnings', () => {
    const r = item(headline(place(project(), 'headline', headlineFrame), ''));
    expect(r?.lines).toEqual([]);
    expect(r?.warnings).toEqual([]);
  });
});

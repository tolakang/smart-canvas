import { describe, expect, it } from 'vitest';
import type { ProjectDoc } from '../model';
import { connectSource } from '../ports';
import { addSource } from '../sources';
import { computeLayout, coverFrame, familyOf, type LayoutDeps } from './index';
import { mockMeasure as measure, output, project } from './test-doc';

function withPhoto(doc: ProjectDoc, focal = { x: 0.7, y: 0.4 }): ProjectDoc {
  return {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'background' ? { ...s, kind: 'image', content: { kind: 'image', assetId: 'a1', focal } } : s,
    ),
  };
}

const deps: LayoutDeps = { measure, assets: { a1: { width: 4000, height: 3000 } } };
const bg = (doc: ProjectDoc, d = deps) => computeLayout(doc, 'o1', d).items.find((i) => i.sourceId === 'background');
function bgItem(doc: ProjectDoc) {
  const item = bg(doc);
  if (!item) throw new Error('no background item');
  return item;
}

describe('background (image) — cover with focal', () => {
  it('example C: 4000×3000 at focal (0.7, 0.4) on 1080×1350', () => {
    expect(bg(withPhoto(project()))?.frame).toEqual({ x: -720, y: 0, w: 1800, h: 1350 });
  });

  it('keeps the focal centred when the edges allow and clamps otherwise', () => {
    expect(coverFrame(1000, 1000, 2000, 1000, { x: 0.5, y: 0.5 })).toEqual({ x: -500, y: 0, w: 2000, h: 1000 });
    expect(coverFrame(1000, 1000, 2000, 1000, { x: 0, y: 0.5 }).x).toBe(0);
    expect(coverFrame(1000, 1000, 2000, 1000, { x: 1, y: 0.5 }).x).toBe(-1000);
  });

  it('covers the full canvas including bleed', () => {
    const doc = withPhoto(project(output({ size: { width: 1000, height: 1000, unit: 'px' }, bleedMm: 25.4 })), { x: 0.5, y: 0.5 });
    // bleed = 96 px each side → 1192×1192; 4000×3000 cover → s = 1192/3000
    const f = bgItem(doc).frame;
    expect(f.h).toBeCloseTo(1192);
    expect(f.w).toBeCloseTo(4000 * (1192 / 3000));
    expect(f.y).toBe(0);
    expect(f.x).toBeCloseTo(1192 / 2 - f.w / 2);
  });

  it('falls back to the full rect while the asset is missing or unknown', () => {
    const doc = withPhoto(project());
    expect(bg(doc, { measure, assets: {} })?.frame).toEqual({ x: 0, y: 0, w: 1080, h: 1350 });
  });
});

describe('background (fill)', () => {
  it('is the full canvas rect incl. bleed', () => {
    const doc = project(output({ size: { width: 210, height: 297, unit: 'mm' }, bleedMm: 3 }));
    const r = computeLayout(doc, 'o1', deps);
    expect(bg(doc)?.frame).toEqual({ x: 0, y: 0, w: r.metrics.full.w, h: r.metrics.full.h });
  });
});

describe('computeLayout', () => {
  const backgrounds = (doc: ProjectDoc) => computeLayout(doc, 'o1', deps).items.map((i) => i.sourceId).filter((id) => id === 'bg2' || id === 'background');

  it('orders back→front, skips hidden and unwired sources', () => {
    const r1 = addSource(project(), { id: 'bg2', label: 'Paper', kind: 'fill', behavesLike: 'background' });
    if (!r1.ok) throw new Error(r1.error);
    let doc = r1.doc; // bg2 is unwired
    expect(backgrounds(doc)).toEqual(['background']);
    const r2 = connectSource(doc, 'bg2');
    if (!r2.ok) throw new Error(r2.error);
    doc = r2.doc;
    const order = [...doc.sources].sort((a, b) => b.port - a.port).map((s) => s.id).filter((id) => id === 'bg2' || id === 'background');
    expect(backgrounds(doc)).toEqual(order);
    doc = { ...doc, sources: doc.sources.map((s) => (s.id === 'bg2' ? { ...s, visible: false } : s)) };
    expect(backgrounds(doc)).toEqual(['background']);
  });

  it('applies override frame fields last and honours override.hidden', () => {
    const ov = { sourceId: 'background', frame: { x: 10, w: 500 }, updatedBy: 'u', updatedAt: '2026-01-01T00:00:00Z' };
    const item = bgItem(project(output({ overrides: [ov] })));
    expect(item.frame).toEqual({ x: 10, y: 0, w: 500, h: 1350 });
    expect(item.overridden).toBe(true);
    expect(bg(project(output({ overrides: [{ ...ov, frame: undefined, hidden: true }] })))).toBeUndefined();
    expect(bg(project())?.overridden).toBe(false);
  });

  it('picks the family from the trim ratio unless set', () => {
    expect(familyOf({ family: 'auto' }, { w: 3000, h: 1000 })).toBe('side');
    expect(familyOf({ family: 'auto' }, { w: 1300, h: 1000 })).toBe('side');
    expect(familyOf({ family: 'auto' }, { w: 1299, h: 1000 })).toBe('stack');
    expect(familyOf({ family: 'stack' }, { w: 3000, h: 1000 })).toBe('stack');
    expect(computeLayout(project(output({ size: { width: 3000, height: 1000, unit: 'px' } })), 'o1', deps).family).toBe('side');
  });

  it('throws for an unknown output', () => {
    expect(() => computeLayout(project(), 'nope', deps)).toThrow();
  });
});

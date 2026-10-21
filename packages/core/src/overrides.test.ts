import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { mockMeasure, output, place, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { outputScene } from './outputs';
import { overrideDiff, resetOutputOverrides, resetOverride, setOverrideFrame, setOverrideHidden, setOverrideStyle } from './overrides';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const ada = { by: 'u1', at: '2026-10-20T00:00:00.000Z' };
const bob = { by: 'u2', at: '2026-10-20T01:00:00.000Z' };
const base = () => place(project(output()), 'subject', { x: 900, y: 750, w: 1200, h: 1800 });
const ovOf = (doc: ProjectDoc, id: string) => doc.outputs[0]?.overrides.find((o) => o.sourceId === id);
const deps = { measure: mockMeasure, assets: {} };

describe('setOverrideFrame', () => {
  it('stores the frame (rounded, rotation normalized) with author and time; later writes merge', () => {
    let doc = ok(setOverrideFrame(base(), 'o1', 'subject', { x: 10.12345, y: 20, w: 300, h: 0.2, rotation: -30 }, ada));
    expect(ovOf(doc, 'subject')).toEqual({ sourceId: 'subject', frame: { x: 10.123, y: 20, w: 300, h: 1, rotation: 330 }, updatedBy: 'u1', updatedAt: ada.at });
    doc = ok(setOverrideFrame(doc, 'o1', 'subject', { x: 50 }, bob));
    expect(ovOf(doc, 'subject')).toMatchObject({ frame: { x: 50, y: 20, w: 300 }, updatedBy: 'u2', updatedAt: bob.at });
    expect(doc.outputs[0]?.overrides).toHaveLength(1);
  });

  it('is applied by the engine', () => {
    const doc = ok(setOverrideFrame(base(), 'o1', 'subject', { x: 5, y: 6 }, ada));
    const item = computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === 'subject');
    expect(item).toMatchObject({ frame: { x: 5, y: 6 }, overridden: true });
    expect(item?.frame.w).toBeCloseTo(432); // example A: the auto width stays
  });

  it('fails for unknown outputs or sources', () => {
    expect(setOverrideFrame(base(), 'nope', 'subject', { x: 1 }, ada)).toEqual({ ok: false, error: 'not_found' });
    expect(setOverrideFrame(base(), 'o1', 'nope', { x: 1 }, ada)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('setOverrideStyle', () => {
  it('keeps only fields that differ from the source style, validated like the text panel', () => {
    let doc = ok(setOverrideStyle(base(), 'o1', 'headline', { color: '#FF0000', fontWeight: 700, fontSizePx: 33.3 }, ada));
    // default weight is 700 → not stored; size snapped to the 0.5 grid
    expect(ovOf(doc, 'headline')?.style).toEqual({ color: '#ff0000', fontSizePx: 33.5 });
    doc = ok(setOverrideStyle(doc, 'o1', 'headline', { color: '#111111' }, ada)); // back to the source colour
    expect(ovOf(doc, 'headline')?.style).toEqual({ fontSizePx: 33.5 });
  });

  it('drops the override when nothing differs any more', () => {
    let doc = ok(setOverrideStyle(base(), 'o1', 'headline', { align: 'left' }, ada));
    doc = ok(setOverrideStyle(doc, 'o1', 'headline', { align: 'center' }, ada));
    expect(ovOf(doc, 'headline')).toBeUndefined();
  });

  it('rejects non-text sources and reaches the renderer scene', () => {
    expect(setOverrideStyle(base(), 'o1', 'subject', { color: '#ff0000' }, ada)).toEqual({ ok: false, error: 'bad_behavior' });
    const doc = ok(setOverrideStyle(base(), 'o1', 'headline', { color: '#00ff00' }, ada));
    const scene = outputScene(computeLayout(doc, 'o1', deps), doc.outputs[0]);
    expect(scene.items.find((i) => i.sourceId === 'headline')?.style).toEqual({ color: '#00ff00' });
  });
});

describe('setOverrideHidden', () => {
  it('hides on one output only, and showing again removes an empty override', () => {
    let doc = ok(setOverrideHidden(base(), 'o1', 'logo', true, ada));
    expect(computeLayout(doc, 'o1', deps).items.some((i) => i.sourceId === 'logo')).toBe(false);
    expect(doc.sources.find((s) => s.id === 'logo')?.visible).toBe(true);
    doc = ok(setOverrideHidden(doc, 'o1', 'logo', false, ada));
    expect(ovOf(doc, 'logo')).toBeUndefined();
  });
});

describe('overrideDiff (T5.2)', () => {
  it('lists overridden fields with their auto values', () => {
    let doc = ok(setOverrideFrame(base(), 'o1', 'subject', { x: 5, w: 432 }, ada)); // w equals auto (example A) → not a difference
    expect(overrideDiff(doc, 'o1', 'subject', deps)).toEqual([{ field: 'x', auto: 324, value: 5 }]);
    doc = ok(setOverrideStyle(doc, 'o1', 'headline', { color: '#ff0000', fontSizePx: 40 }, ada));
    const headline = overrideDiff(doc, 'o1', 'headline', deps);
    expect(headline).toContainEqual({ field: 'color', auto: '#111111', value: '#ff0000' });
    expect(headline.find((f) => f.field === 'fontSizePx')).toMatchObject({ value: 40 });
    doc = ok(setOverrideHidden(doc, 'o1', 'logo', true, ada));
    expect(overrideDiff(doc, 'o1', 'logo', deps)).toEqual([{ field: 'hidden', auto: false, value: true }]);
  });

  it('is empty without an override', () => {
    expect(overrideDiff(base(), 'o1', 'subject', deps)).toEqual([]);
  });
});

describe('reset (T5.3)', () => {
  const edited = () => {
    let doc = ok(setOverrideFrame(base(), 'o1', 'subject', { x: 5 }, ada));
    doc = ok(setOverrideHidden(doc, 'o1', 'logo', true, ada));
    return ok(setOverrideStyle(doc, 'o1', 'headline', { color: '#ff0000' }, ada));
  };
  const auto = computeLayout(base(), 'o1', deps);
  const item = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);

  it('reset layer removes one override; that layer is auto again, others stay', () => {
    const doc = ok(resetOverride(edited(), 'o1', 'subject'));
    expect(item(doc, 'subject')).toEqual(auto.items.find((i) => i.sourceId === 'subject'));
    expect(doc.outputs[0]?.overrides.map((o) => o.sourceId).sort()).toEqual(['headline', 'logo']);
    expect(ok(resetOverride(doc, 'o1', 'subject'))).toBe(doc);
  });

  it('reset output clears all overrides; the layout equals auto', () => {
    const doc = ok(resetOutputOverrides(edited(), 'o1'));
    expect(doc.outputs[0]?.overrides).toEqual([]);
    expect(computeLayout(doc, 'o1', deps)).toEqual(auto);
    expect(resetOutputOverrides(doc, 'nope')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('shear overrides', () => {
  it('stores a clamped shear, the engine draws it, and it shows as an override field', () => {
    const doc = ok(setOverrideFrame(base(), 'o1', 'subject', { shear: -90 }, ada));
    expect(ovOf(doc, 'subject')?.frame).toEqual({ shear: -75 });
    expect(computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === 'subject')?.frame.shear).toBe(-75);
    expect(overrideDiff(doc, 'o1', 'subject', deps)).toEqual([{ field: 'shear', auto: 0, value: -75 }]);
  });
  it('a master shear carries into every output (like rotation)', () => {
    const doc = place(project(output()), 'subject', { x: 900, y: 750, w: 1200, h: 1800, rotation: 15, shear: 12 });
    expect(computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === 'subject')?.frame).toMatchObject({ rotation: 15, shear: 12 });
  });
});

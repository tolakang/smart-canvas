import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { LIMITS, type ProjectDoc } from './model';
import { addOutput, deleteOutput, outputDefaults, outputScene, outputWireId, updateOutput } from './outputs';
import { createProjectDoc } from './project';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const insta = { id: 'o1', label: 'Instagram', size: { width: 1080, height: 1350, unit: 'px' as const } };

describe('addOutput', () => {
  it('adds an automatic output wired to main, right of the master preview', () => {
    const doc = ok(addOutput(createProjectDoc('P'), insta));
    expect(doc.outputs).toEqual([{ ...insta, overrides: [], board: { x: 420, y: 0 } }]);
    expect(doc.edges).toEqual([{ id: outputWireId('o1'), from: 'main', to: 'o1', kind: 'composition' }]);
    const two = ok(addOutput(doc, { ...insta, id: 'o2' }));
    expect(two.outputs[1]?.board).toEqual({ x: 420, y: 480 });
  });

  it('enforces the 10-output cap and rejects bad settings', () => {
    let doc = createProjectDoc('P');
    for (let i = 0; i < LIMITS.maxOutputs; i++) doc = ok(addOutput(doc, { ...insta, id: `o${i}` }));
    expect(addOutput(doc, { ...insta, id: 'x' })).toEqual({ ok: false, error: 'output_limit' });
    const fresh = createProjectDoc('P');
    expect(addOutput(fresh, { ...insta, size: { width: 0, height: 10, unit: 'px' } })).toEqual({ ok: false, error: 'invalid' });
    expect(addOutput(fresh, { ...insta, exportScale: 5 })).toEqual({ ok: false, error: 'invalid' });
    expect(addOutput(fresh, { ...insta, label: '  ' })).toEqual({ ok: false, error: 'invalid' });
    expect(addOutput(ok(addOutput(fresh, insta)), insta)).toEqual({ ok: false, error: 'invalid' });
  });

  it('print defaults: 300 dpi and 3 mm bleed; screen: 1×', () => {
    expect(outputDefaults('mm')).toEqual({ dpi: 300, bleedMm: 3 });
    expect(outputDefaults('px')).toEqual({ exportScale: 1 });
  });
});

describe('updateOutput / deleteOutput', () => {
  it('changes settings and keeps overrides', () => {
    const ov = { sourceId: 'logo', hidden: true, updatedBy: 'u', updatedAt: '2026-01-01T00:00:00Z' };
    let doc = ok(addOutput(createProjectDoc('P'), insta));
    doc = { ...doc, outputs: doc.outputs.map((o) => ({ ...o, overrides: [ov] })) };
    doc = ok(updateOutput(doc, 'o1', { size: { width: 210, height: 297, unit: 'mm' }, dpi: 300, bleedMm: 3 }));
    expect(doc.outputs[0]).toMatchObject({ size: { width: 210, height: 297, unit: 'mm' }, dpi: 300, bleedMm: 3, overrides: [ov] });
    expect(updateOutput(doc, 'o1', { dpi: 10 })).toEqual({ ok: false, error: 'invalid' });
    expect(updateOutput(doc, 'o1', { bleedMm: -1 })).toEqual({ ok: false, error: 'invalid' });
    expect(updateOutput(doc, 'nope', {})).toEqual({ ok: false, error: 'not_found' });
  });

  it('delete removes the output and its wire', () => {
    const doc = ok(deleteOutput(ok(addOutput(createProjectDoc('P'), insta)), 'o1'));
    expect(doc.outputs).toEqual([]);
    expect(doc.edges).toEqual([]);
  });
});

describe('outputScene', () => {
  it('is the full canvas (incl. bleed) with the engine items', () => {
    const doc = ok(addOutput(createProjectDoc('P'), { ...insta, bleedMm: 25.4 }));
    const layout = computeLayout({ ...doc, edges: [...doc.edges, { id: 'in:background', from: 'background', to: 'main', kind: 'layer' }] }, 'o1', {
      measure: () => 0,
      assets: {},
    });
    expect(outputScene(layout)).toEqual({ width: 1272, height: 1542, items: [{ sourceId: 'background', frame: { x: 0, y: 0, w: 1272, h: 1542 } }] });
  });
});

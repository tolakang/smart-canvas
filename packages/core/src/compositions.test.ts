import { describe, expect, it } from 'vitest';
import { addComposition, deleteComposition, removeRow, renameComposition, setCompositionSize } from './compositions';
import { compositionById, layerOrder, outputComposition } from './graph';
import { computeLayout } from './layout';
import { mockMeasure } from './layout/test-doc';
import { LIMITS, type ProjectDoc } from './model';
import { addOutput, reconnectOutput } from './outputs';
import { connectSource } from './ports';
import { createProjectDoc } from './project';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const deps = { measure: mockMeasure, assets: {} };

describe('compositions (T12.3, D32)', () => {
  it('adds a composition below the others, empty, at the default size', () => {
    const doc = ok(addComposition(createProjectDoc('P'), { id: 'b', label: 'Variant B' }));
    expect(compositionById(doc, 'b')).toEqual({ id: 'b', label: 'Variant B', size: { width: 3000, height: 3000, unit: 'px' }, placements: {}, layers: [], board: { x: 0, y: 900 } });
    expect(addComposition(doc, { id: 'b', label: 'Again' })).toEqual({ ok: false, error: 'invalid' });
    let full = doc;
    while (full.compositions.length < LIMITS.maxCompositions) full = ok(addComposition(full, { id: `c${full.compositions.length}`, label: 'X' }));
    expect(addComposition(full, { id: 'z', label: 'Z' })).toEqual({ ok: false, error: 'limit' });
  });

  it('wiring an input into it makes it a row there (with its own placement); main keeps every input', () => {
    let doc = ok(addComposition(createProjectDoc('P'), { id: 'b', label: 'B' }));
    doc = ok(connectSource(doc, 'subject', undefined, 'b'));
    doc = ok(connectSource(doc, 'headline', 0, 'b'));
    expect(layerOrder(doc, 'b')).toEqual(['headline', 'subject']);
    expect(compositionById(doc, 'b')?.placements.subject).toBeDefined();
    expect(layerOrder(doc)).toEqual(['logo', 'headline', 'subject', 'background']);
    expect(doc.edges.map((e) => e.id)).toEqual(['in:subject>b', 'in:headline>b']);
  });

  it('an output follows the composition it is wired to (its size and rows)', () => {
    let doc = ok(addComposition(createProjectDoc('P'), { id: 'b', label: 'B', size: { width: 1000, height: 500, unit: 'px' } }));
    for (const id of ['background', 'subject']) doc = ok(connectSource(doc, id));
    doc = ok(connectSource(doc, 'background', undefined, 'b'));
    doc = ok(addOutput(doc, { id: 'o', label: 'O', size: { width: 1080, height: 1080, unit: 'px' }, composition: 'b' }));
    expect(outputComposition(doc, 'o')).toBe('b');
    expect(computeLayout(doc, 'o', deps).items.map((i) => i.sourceId)).toEqual(['background']); // b has no subject
    doc = ok(reconnectOutput(doc, 'o', 'keep', 'main'));
    expect(outputComposition(doc, 'o')).toBe('main');
    expect(computeLayout(doc, 'o', deps).items.map((i) => i.sourceId)).toEqual(['background', 'subject']);
  });

  it('rename, resize, remove a row (not from main)', () => {
    let doc = ok(addComposition(createProjectDoc('P'), { id: 'b', label: 'B' }));
    doc = ok(connectSource(doc, 'logo', undefined, 'b'));
    doc = ok(renameComposition(doc, 'b', '  Story set '));
    doc = ok(setCompositionSize(doc, 'b', { width: 1080, height: 1920, unit: 'px' }));
    expect(compositionById(doc, 'b')).toMatchObject({ label: 'Story set', size: { width: 1080, height: 1920, unit: 'px' } });
    expect(setCompositionSize(doc, 'b', { width: 0, height: 10, unit: 'px' })).toEqual({ ok: false, error: 'invalid' });
    const removed = ok(removeRow(doc, 'b', 'logo'));
    expect(layerOrder(removed, 'b')).toEqual([]);
    expect(compositionById(removed, 'b')?.placements.logo).toBeUndefined();
    expect(removed.edges).toEqual([]);
    expect(removeRow(doc, 'main', 'logo')).toEqual({ ok: false, error: 'invalid' });
  });

  it('deleting a composition freezes the outputs that followed it; main cannot be deleted', () => {
    let doc = ok(addComposition(createProjectDoc('P'), { id: 'b', label: 'B' }));
    doc = ok(connectSource(doc, 'background', undefined, 'b'));
    doc = ok(addOutput(doc, { id: 'o', label: 'O', size: { width: 100, height: 100, unit: 'px' }, composition: 'b' }));
    const after = ok(deleteComposition(doc, 'b', deps));
    expect(after.compositions.map((c) => c.id)).toEqual(['main']);
    expect(after.edges).toEqual([]);
    expect(after.outputs[0]?.frozen?.items.map((i) => i.sourceId)).toEqual(['background']);
    expect(deleteComposition(doc, 'main')).toEqual({ ok: false, error: 'invalid' });
  });
});

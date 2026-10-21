/** T12.8: a composition used as a layer of another composition (or of an output). */
import { describe, expect, it } from 'vitest';
import { addComposition, deleteComposition } from './compositions';
import { compositionHealth } from './health';
import { computeLayout } from './layout';
import { mockMeasure, output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import type { SourceResult } from './sources';
import { connectOutputLayer } from './output-layers';
import { connectSource } from './ports';
import { addProcess, connectProcessInput, layerAssetSize, layerSources } from './processes';
import { masterScene } from './render';

const ok = (r: SourceResult | { ok: false; error: string }): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

/** Composition "badge" (1000×500) with the logo as its only row, wired into main. */
function nestedDoc(): ProjectDoc {
  let doc = ok(addComposition(project(), { id: 'badge', label: 'Badge', size: { width: 1000, height: 500, unit: 'px' } }));
  doc = ok(connectSource(doc, 'logo', undefined, 'badge'));
  return ok(connectSource(doc, 'badge'));
}

describe('nested compositions (T12.8)', () => {
  it('wired into a row it is a layer: subject behaviour, its own scene, its size as the picture size', () => {
    const doc = nestedDoc();
    expect(doc.compositions[0]?.layers[0]).toBe('badge');
    expect(doc.compositions[0]?.placements['badge']).toEqual({ x: 0.2, y: 0.12, w: 0.6, h: 0.6 });
    const layer = layerSources(doc).find((s) => s.id === 'badge');
    expect(layer).toMatchObject({ label: 'Badge', behavesLike: 'subject', nested: { compositionId: 'badge', scene: { width: 1000, height: 500 } } });
    expect(layer?.nested?.scene.items.map((i) => i.sourceId)).toEqual(['logo']);
    expect(layer && layerAssetSize(layer, {})).toEqual({ width: 1000, height: 500 });
    expect(masterScene(doc).items.some((i) => i.sourceId === 'badge')).toBe(true);
    expect(computeLayout({ ...doc, outputs: [output()] }, 'o1', { measure: mockMeasure, assets: {} }).items.some((i) => i.sourceId === 'badge')).toBe(true);
    expect(compositionHealth(doc).issues.some((i) => i.sourceId === 'badge')).toBe(false); // never "no file yet"
  });

  it('nests deeper; no loops; not a process input; an output can take it as its own layer', () => {
    let doc = nestedDoc();
    doc = ok(addComposition(doc, { id: 'outer', label: 'Outer' }));
    doc = ok(connectSource(doc, 'main', undefined, 'outer'));
    expect(layerSources(doc).find((s) => s.id === 'outer')).toBeUndefined(); // not a layer anywhere yet
    expect(layerSources(doc).find((s) => s.id === 'main')?.nested?.scene.items.some((i) => i.sourceId === 'badge')).toBe(true);
    expect(connectSource(doc, 'outer', undefined, 'badge').ok).toBe(false); // outer ← main ← badge
    expect(connectSource(doc, 'badge', undefined, 'badge').ok).toBe(false);
    const withProcess = ok(addProcess(doc, { id: 'p', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 } }));
    expect(connectProcessInput(withProcess, 'p', 'badge').ok).toBe(false);
    const own = ok(connectOutputLayer({ ...doc, outputs: [output()] }, 'o1', 'badge'));
    expect(own.outputs[0]?.layers).toEqual(['badge']);
  });

  it('deleting it takes its rows elsewhere with it', () => {
    const doc = ok(deleteComposition(nestedDoc(), 'badge'));
    expect(doc.compositions[0]?.layers.includes('badge')).toBe(false);
    expect(doc.compositions[0]?.placements['badge']).toBeUndefined();
    expect(doc.edges.some((e) => e.from === 'badge')).toBe(false);
  });
});

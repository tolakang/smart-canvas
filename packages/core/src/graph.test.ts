import { describe, expect, it } from 'vitest';
import { connectRefusal, edgeId, layerOrder, mainComposition, migrateProjectDoc, outputComposition, portOf, setEdgePoints, wiredLayers } from './graph';
import type { ProjectDoc } from './model';
import { createProjectDoc } from './project';

/** A v1 document as stored before D32 (one master, wires, a port on each source). */
const v1 = () => {
  const v2 = createProjectDoc('Old');
  const ports: Record<string, number> = { background: 3, subject: 1, headline: 2, logo: 0 };
  return {
    schema: 1 as const,
    rev: 7,
    name: 'Old',
    master: { size: { width: 2000, height: 1000, unit: 'px' as const }, placements: { subject: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }, board: { x: 5, y: 6 } },
    sources: v2.sources.map((s) => ({ ...s, port: ports[s.id] ?? 0 })),
    outputs: [
      { id: 'ig', label: 'IG', size: { width: 1080, height: 1080, unit: 'px' as const }, family: 'auto' as const, overrides: [{ sourceId: 'subject', hidden: true, updatedBy: 'u', updatedAt: 'x' }], board: { x: 0, y: 0 } },
      { id: 'frozen', label: 'F', size: { width: 100, height: 100, unit: 'px' as const }, family: 'auto' as const, overrides: [], frozen: { items: [] }, board: { x: 0, y: 0 } },
    ],
    wires: [
      { id: 'in:subject', from: 'subject', to: 'main', port: 1 },
      { id: 'in:logo', from: 'logo', to: 'main', port: 0 },
      { id: 'out:ig', from: 'main', to: 'ig' },
      { id: 'in:gone', from: 'gone', to: 'main', port: 9 }, // dangling: dropped
    ],
  };
};

describe('migrateProjectDoc (v1 → v2, D32)', () => {
  it('turns the master into composition main with rows in port order, and wires into typed edges', () => {
    const doc = migrateProjectDoc(v1());
    expect(doc.schema).toBe(4); // and on to v4
    expect(doc.rev).toBe(7);
    expect(mainComposition(doc)).toEqual({
      id: 'main',
      label: 'Master preview',
      size: { width: 2000, height: 1000, unit: 'px' },
      placements: { subject: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
      layers: ['logo', 'subject', 'headline', 'background'],
      board: { x: 5, y: 6 },
    });
    expect(doc.edges).toEqual([
      { id: 'in:subject', from: 'subject', to: 'main', kind: 'layer' },
      { id: 'in:logo', from: 'logo', to: 'main', kind: 'layer' },
      { id: 'out:ig', from: 'main', to: 'ig', kind: 'composition' },
    ]);
    expect(doc.sources.every((s) => !('port' in s))).toBe(true);
    expect(doc.outputs.every((o) => !('family' in o))).toBe(true); // D61
    expect(doc.outputs[0]?.overrides).toHaveLength(1); // overrides kept
    expect(doc.outputs[1]?.frozen).toEqual({ items: [] }); // frozen kept, still disconnected
    expect(outputComposition(doc, 'ig')).toBe('main');
    expect(outputComposition(doc, 'frozen')).toBeUndefined();
  });

  it('leaves v4 documents as they are', () => {
    const doc = createProjectDoc('New');
    expect(migrateProjectDoc(doc)).toBe(doc);
  });
});

describe('migrateProjectDoc (v2 → v3, D56)', () => {
  it('drops processes, other master previews, non-input rows, output-only layers and Core Rule nodes; outputs of a dropped preview follow main', () => {
    const base = createProjectDoc('Old');
    const [main] = base.compositions;
    if (!main) throw new Error('no composition');
    const frame = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const v2 = {
      ...base,
      schema: 2 as const,
      processes: [{ id: 'p1', label: 'Crop', op: { type: 'crop', rect: frame }, board: { x: 0, y: 0 } }],
      coreRules: [{ id: 'cr', composition: 'main', board: { x: 0, y: 0 } }],
      compositions: [
        { ...main, layers: [...main.layers, 'p1', 'b'], placements: { ...main.placements, p1: frame, b: frame } },
        { ...main, id: 'gv', label: 'Vertical guide', guide: { of: 'main', family: 'vertical' as const }, layers: [...main.layers] },
        { ...main, id: 'b', label: 'Variant', layers: ['subject'] },
      ],
      outputs: [
        { id: 'o1', label: 'O1', size: { width: 1, height: 1, unit: 'px' as const }, family: 'auto' as const, layers: ['logo', 'p1'], overrides: [{ sourceId: 'p1', hidden: true, updatedBy: 'u', updatedAt: 'x' }, { sourceId: 'logo', hidden: true, updatedBy: 'u', updatedAt: 'x' }], board: { x: 0, y: 0 } },
        { id: 'o2', label: 'O2', size: { width: 1, height: 1, unit: 'px' as const }, family: 'auto' as const, overrides: [], frozen: { items: [{ sourceId: 'p1', frame: { x: 0, y: 0, w: 1, h: 1 } }] }, board: { x: 0, y: 0 } },
      ],
      edges: [
        ...base.edges,
        { id: 'in:subject>p1', from: 'subject', to: 'p1', kind: 'layer' as const },
        { id: 'in:p1', from: 'p1', to: 'main', kind: 'layer' as const },
        { id: 'in:b', from: 'b', to: 'main', kind: 'layer' as const },
        { id: 'in:subject>b', from: 'subject', to: 'b', kind: 'layer' as const },
        { id: 'in:logo>o1', from: 'logo', to: 'o1', kind: 'layer' as const },
        { id: 'out:o1', from: 'b', to: 'o1', kind: 'composition' as const },
      ],
      groups: [{ id: 'g', label: 'G', color: 'grey' as const, nodes: ['p1', 'o1'] }],
    };
    const doc = migrateProjectDoc(v2 as unknown as ProjectDoc);
    expect(doc.schema).toBe(4);
    expect(doc.outputs.every((o) => !('family' in o))).toBe(true);
    expect('processes' in doc).toBe(false);
    expect('coreRules' in doc).toBe(false);
    expect(doc.compositions.map((c) => c.id)).toEqual(['main', 'gv']);
    expect(mainComposition(doc).layers).toEqual(main.layers);
    expect(Object.keys(mainComposition(doc).placements).sort()).toEqual(Object.keys(main.placements).sort());
    expect(doc.edges.filter((e) => e.kind === 'layer').every((e) => e.to === 'main' && doc.sources.some((s) => s.id === e.from))).toBe(true);
    expect(outputComposition(doc, 'o1')).toBe('main');
    const [o1, o2] = doc.outputs;
    expect(o1 && 'layers' in o1).toBe(false);
    expect(o1?.overrides.map((ov) => ov.sourceId)).toEqual(['logo']);
    expect(o2?.frozen).toEqual({ items: [] });
    expect(doc.groups?.[0]?.nodes).toEqual(['o1']);
  });

  it('renames the old default names to "Master preview" (D39); a name the user chose is kept', () => {
    const doc = createProjectDoc('Old');
    const [c0] = doc.compositions;
    if (!c0) throw new Error('no composition');
    const old = { ...doc, compositions: [{ ...c0, label: 'Main preview' }, { ...c0, id: 'b', label: 'Main preview 2' }, { ...c0, id: 'c', label: 'Main preview for TV' }] };
    expect(migrateProjectDoc(old).compositions.map((c) => c.label)).toEqual(['Master preview', 'Master preview 2', 'Main preview for TV']);
  });
});

describe('migrateProjectDoc (v3 → v4, D61)', () => {
  it('drops output.family and keeps everything else', () => {
    const now = createProjectDoc('V3');
    const out = { id: 'o', label: 'O', size: { width: 10, height: 10, unit: 'px' as const }, overrides: [], board: { x: 1, y: 2 }, bleedMm: 3 };
    const v3 = { ...now, schema: 3 as const, outputs: [{ ...out, family: 'side' }] };
    const doc = migrateProjectDoc(v3 as unknown as ProjectDoc);
    expect(doc).toEqual({ ...now, outputs: [out] });
  });
});

describe('graph helpers', () => {
  const doc: ProjectDoc = {
    ...createProjectDoc('G'),
    compositions: [...createProjectDoc('G').compositions, { id: 'c2', label: 'Vertical guide', size: { width: 10, height: 16, unit: 'px' }, placements: {}, layers: ['subject'], board: { x: 0, y: 0 }, guide: { of: 'main', family: 'vertical' } }],
    outputs: [{ id: 'o', label: 'O', size: { width: 1, height: 1, unit: 'px' }, overrides: [], board: { x: 0, y: 0 } }],
    edges: [
      { id: 'b', from: 'subject', to: 'c2', kind: 'layer' },
      { id: 'c', from: 'main', to: 'o', kind: 'composition' },
    ],
  };

  it('rows, ports and wired layers per composition', () => {
    expect(layerOrder(doc)).toEqual(['logo', 'headline', 'subject', 'background']);
    expect(portOf(doc, 'subject')).toBe(2);
    expect(portOf(doc, 'subject', 'c2')).toBe(0);
    expect([...wiredLayers(doc, 'c2')]).toEqual(['subject']);
    expect(outputComposition(doc, 'o')).toBe('main');
  });

  it('edge ids keep the v1 wire ids for main and outputs', () => {
    expect(edgeId('subject', 'main', 'layer')).toBe('in:subject');
    expect(edgeId('subject', 'c2', 'layer')).toBe('in:subject>c2');
    expect(edgeId('c2', 'o', 'composition')).toBe('out:o');
  });

  it('refuses wrong port types and unknown nodes: inputs feed compositions, compositions feed outputs (D56)', () => {
    expect(connectRefusal(doc, 'logo', 'main', 'layer')).toBeNull();
    expect(connectRefusal(doc, 'main', 'o', 'composition')).toBeNull();
    expect(connectRefusal(doc, 'main', 'o', 'layer')).toBe('wrong_type'); // no output-only layers
    expect(connectRefusal(doc, 'logo', 'o', 'layer')).toBe('wrong_type');
    expect(connectRefusal(doc, 'c2', 'main', 'layer')).toBe('wrong_type'); // no composition as a layer
    expect(connectRefusal(doc, 'logo', 'o', 'composition')).toBe('wrong_type');
    expect(connectRefusal(doc, 'o', 'main', 'layer')).toBe('wrong_type'); // outputs have no out-port
    expect(connectRefusal(doc, 'nope', 'main', 'layer')).toBe('unknown_node');
  });
});

describe('reroute points (T13.8)', () => {
  it('set, rounded and capped; none = removed', () => {
    const doc: ProjectDoc = { ...createProjectDoc('R'), edges: [{ id: 'e', from: 'logo', to: 'main', kind: 'layer' }] };
    const r = setEdgePoints(doc, 'e', [{ x: 10.4, y: 20.6 }]);
    expect(r.ok && r.doc.edges[0]).toEqual({ id: 'e', from: 'logo', to: 'main', kind: 'layer', points: [{ x: 10, y: 21 }] });
    const cleared = r.ok ? setEdgePoints(r.doc, 'e', []) : r;
    expect(cleared.ok && cleared.doc.edges[0]).toEqual({ id: 'e', from: 'logo', to: 'main', kind: 'layer' });
    expect(setEdgePoints(doc, 'e', Array.from({ length: 11 }, () => ({ x: 0, y: 0 }))).ok).toBe(false);
    expect(setEdgePoints(doc, 'nope', []).ok).toBe(false);
  });
});

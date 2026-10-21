import { describe, expect, it } from 'vitest';
import { connectRefusal, edgeId, layerOrder, mainComposition, migrateProjectDoc, outputComposition, portOf, wiredLayers } from './graph';
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
    expect(doc.schema).toBe(2);
    expect(doc.rev).toBe(7);
    expect(mainComposition(doc)).toEqual({
      id: 'main',
      label: 'Main preview',
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
    expect(doc.processes).toEqual([]);
    expect(doc.outputs[0]?.overrides).toHaveLength(1); // overrides kept
    expect(doc.outputs[1]?.frozen).toEqual({ items: [] }); // frozen kept, still disconnected
    expect(outputComposition(doc, 'ig')).toBe('main');
    expect(outputComposition(doc, 'frozen')).toBeUndefined();
  });

  it('leaves v2 documents as they are', () => {
    const doc = createProjectDoc('New');
    expect(migrateProjectDoc(doc)).toBe(doc);
  });
});

describe('graph helpers', () => {
  const doc: ProjectDoc = {
    ...createProjectDoc('G'),
    compositions: [...createProjectDoc('G').compositions, { id: 'c2', label: 'B', size: { width: 10, height: 10, unit: 'px' }, placements: {}, layers: ['subject'], board: { x: 0, y: 0 } }],
    processes: [{ id: 'p1', label: 'Crop', op: { type: 'crop', rect: { x: 0, y: 0, w: 1, h: 1 } }, board: { x: 0, y: 0 } }],
    outputs: [{ id: 'o', label: 'O', size: { width: 1, height: 1, unit: 'px' }, family: 'auto', overrides: [], board: { x: 0, y: 0 } }],
    edges: [
      { id: 'a', from: 'subject', to: 'p1', kind: 'layer' },
      { id: 'b', from: 'p1', to: 'c2', kind: 'layer' },
      { id: 'c', from: 'c2', to: 'o', kind: 'composition' },
    ],
  };

  it('rows, ports and wired layers per composition', () => {
    expect(layerOrder(doc)).toEqual(['logo', 'headline', 'subject', 'background']);
    expect(portOf(doc, 'subject')).toBe(2);
    expect(portOf(doc, 'subject', 'c2')).toBe(0);
    expect([...wiredLayers(doc, 'c2')]).toEqual(['p1']);
    expect(outputComposition(doc, 'o')).toBe('c2');
  });

  it('edge ids keep the v1 wire ids for main and outputs', () => {
    expect(edgeId('subject', 'main', 'layer')).toBe('in:subject');
    expect(edgeId('subject', 'c2', 'layer')).toBe('in:subject>c2');
    expect(edgeId('c2', 'o', 'composition')).toBe('out:o');
  });

  it('refuses wrong port types, unknown nodes and cycles', () => {
    expect(connectRefusal(doc, 'logo', 'main', 'layer')).toBeNull();
    expect(connectRefusal(doc, 'headline', 'p1', 'layer')).toBeNull();
    expect(connectRefusal(doc, 'main', 'o', 'composition')).toBeNull();
    // T12.8: a composition is a layer of a composition or an output, never a process's input, never of itself.
    expect(connectRefusal(doc, 'main', 'o', 'layer')).toBeNull();
    expect(connectRefusal(doc, 'main', 'p1', 'layer')).toBe('wrong_type');
    expect(connectRefusal(doc, 'main', 'main', 'layer')).toBe('cycle');
    expect(connectRefusal(doc, 'logo', 'o', 'composition')).toBe('wrong_type');
    expect(connectRefusal(doc, 'o', 'main', 'layer')).toBe('wrong_type'); // outputs have no out-port
    expect(connectRefusal(doc, 'nope', 'main', 'layer')).toBe('unknown_node');
    expect(connectRefusal(doc, 'p1', 'p1', 'layer')).toBe('cycle');
    const chained: ProjectDoc = { ...doc, processes: [...doc.processes, { id: 'p2', label: 'Adjust', op: { type: 'adjust', opacity: 0.5 }, board: { x: 0, y: 0 } }], edges: [...doc.edges, { id: 'd', from: 'p1', to: 'p2', kind: 'layer' }] };
    expect(connectRefusal(chained, 'p2', 'p1', 'layer')).toBe('cycle');
  });
});

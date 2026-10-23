import { createProjectDoc, setSourceVisible, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { changedNodes, downstreamEdges, insertIndex, relatedEdges, routePath } from './wires';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('wire polish (T13.8)', () => {
  it('related wires: those touching a selected node, and selected wires', () => {
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'x', target: 'y' },
    ];
    expect([...relatedEdges(edges, new Set(['b']), new Set())]).toEqual(['e1', 'e2']);
    expect([...relatedEdges(edges, new Set(), new Set(['e3']))]).toEqual(['e3']);
  });

  it('a content change flows downstream; a move does not count', () => {
    const base = createProjectDoc('P');
    const doc: ProjectDoc = { ...base, edges: [{ id: 'in:logo', from: 'logo', to: 'main', kind: 'layer' }, { id: 'out:o', from: 'main', to: 'o', kind: 'composition' }] };
    const edited = ok(setSourceVisible(doc, 'logo', false));
    expect([...changedNodes(doc, edited)]).toEqual(['logo']);
    expect([...downstreamEdges(edited, new Set(['logo']))].sort()).toEqual(['in:logo', 'out:o']);
    const moved = { ...doc, sources: doc.sources.map((s) => ({ ...s, board: { x: 99, y: 99 } })) };
    expect(changedNodes(doc, moved).size).toBe(0);
  });

  it('reroute points: the path goes through them; a new point goes where it bends the wire least', () => {
    expect(routePath({ x: 0, y: 0 }, { x: 200, y: 0 }, [])).toBe('M 0,0 C 100,0 100,0 200,0');
    expect(routePath({ x: 0, y: 0 }, { x: 200, y: 0 }, [{ x: 100, y: 50 }])).toBe('M 0,0 C 50,0 50,50 100,50 C 150,50 150,0 200,0');
    const pts = [{ x: 100, y: 0 }, { x: 300, y: 0 }];
    expect(insertIndex({ x: 0, y: 0 }, { x: 400, y: 0 }, pts, { x: 50, y: 10 })).toBe(0);
    expect(insertIndex({ x: 0, y: 0 }, { x: 400, y: 0 }, pts, { x: 200, y: 10 })).toBe(1);
    expect(insertIndex({ x: 0, y: 0 }, { x: 400, y: 0 }, pts, { x: 350, y: 10 })).toBe(2);
  });
});

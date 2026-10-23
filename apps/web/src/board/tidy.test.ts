import { addPresetSet, PREVIEW_OFFSET, type ProjectDoc } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { compositionNodeId, MAIN_ID, outputNodeId, setNodeId } from './flow';
import { clearSpot, GAP, tidyPositions, type BoardBox } from './tidy';

const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

describe('clearSpot (N4)', () => {
  it('keeps the spot when nothing is in the way', () => {
    expect(clearSpot([box(500, 500)], { w: 100, h: 100 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('moves just below or right of what is in the way, whichever is nearer', () => {
    // A wide node in the way: below it is nearer than right of it.
    expect(clearSpot([box(0, 0, 1000, 100)], { w: 100, h: 100 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 100 + GAP });
    // A tall node in the way: right of it is nearer.
    expect(clearSpot([box(0, 0, 100, 1000)], { w: 100, h: 100 }, { x: 10, y: 10 })).toEqual({ x: 100 + GAP, y: 10 });
  });

  it('never lands on any node, however crowded', () => {
    const occupied = Array.from({ length: 12 }, (_, i) => box((i % 4) * 150, Math.floor(i / 4) * 150));
    const at = clearSpot(occupied, { w: 200, h: 200 }, { x: 20, y: 20 });
    for (const b of occupied) expect(at.x >= b.x + b.w + GAP || at.y >= b.y + b.h + GAP || at.x + 200 + GAP <= b.x || at.y + 200 + GAP <= b.y).toBe(true);
  });
});

describe('tidyPositions (N4)', () => {
  const base: ProjectDoc = { schemaVersion: 1, sources: [], compositions: [], processes: [], outputs: [], edges: [] } as unknown as ProjectDoc;

  it('asset nodes in a row on top (their order kept), the group under them, Preset nodes in a column under it with their Previews to the right, packed by height', () => {
    const r = addPresetSet({ ...base, compositions: [{ id: MAIN_ID, label: 'Main', size: { width: 1080, height: 1080, unit: 'px' }, layers: [], placements: {}, board: { x: 0, y: 0 } }] } as unknown as ProjectDoc, {
      id: 's',
      label: 'GDN',
      board: { x: 3000, y: 3000 },
      sizes: [
        { id: 'a', label: 'A', size: { width: 300, height: 250, unit: 'px' } },
        { id: 'b', label: 'B', size: { width: 728, height: 90, unit: 'px' } },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    const nodes: BoardBox[] = [
      { id: 'st:img', type: 'assetsNode', position: { x: 900, y: 50 }, measured: { width: 280, height: 300 } },
      { id: 'hl:h', type: 'headlineNode', position: { x: 100, y: 0 }, measured: { width: 300, height: 420 } },
      { id: compositionNodeId(MAIN_ID), type: 'mainNode', position: { x: 2000, y: 2000 }, measured: { width: 700, height: 500 } },
      { id: setNodeId('s'), type: 'presetNode', position: { x: 3000, y: 3000 }, measured: { width: 320, height: 200 } },
      { id: outputNodeId('a'), type: 'outputNode', position: { x: 5000, y: 5000 }, measured: { width: 300, height: 300 } },
      { id: outputNodeId('b'), type: 'outputNode', position: { x: 50, y: 5000 }, measured: { width: 300, height: 300 } },
    ];
    const at = new Map(tidyPositions(r.doc, nodes).map((m) => [m.id, m.position]));
    // The board keeps its top-left corner (x 100, y 0).
    expect(at.get('hl:h')).toEqual({ x: 100, y: 0 });
    expect(at.get('st:img')).toEqual({ x: 100 + 300 + GAP, y: 0 });
    expect(at.get(compositionNodeId(MAIN_ID))).toEqual({ x: 100, y: 420 + GAP * 3 });
    const set = at.get(setNodeId('s'));
    expect(set).toEqual({ x: 100, y: 420 + GAP * 3 + 500 + GAP * 3 });
    expect(at.get(outputNodeId('a'))).toEqual({ x: 100 + PREVIEW_OFFSET.x, y: set?.y });
    expect(at.get(outputNodeId('b'))).toEqual({ x: 100 + PREVIEW_OFFSET.x, y: (set?.y ?? 0) + 300 + GAP });
  });
});

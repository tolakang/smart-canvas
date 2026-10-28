import { addPresetSet, PREVIEW_OFFSET, type ProjectDoc } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { compositionNodeId, MAIN_ID, outputNodeId, setNodeId } from './flow';
import { clearSpot, GAP, onGrid, tidyPositions, tidySelectionPositions, type BoardBox } from './tidy';

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
  const base: ProjectDoc = { schemaVersion: 1, sources: [], compositions: [], outputs: [], edges: [] } as unknown as ProjectDoc;

  it('asset nodes in a row on top (their order kept), the group under them, Preset nodes in a column under it with their Previews in a grid to the right (D69)', () => {
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
    // D69: side by side, each column as wide as its Preview.
    expect(at.get(outputNodeId('b'))).toEqual({ x: 100 + PREVIEW_OFFSET.x + 300 + GAP, y: set?.y });
  });
});

describe('tidySelectionPositions (D57)', () => {
  const n = (id: string, x: number, y: number, w = 100, h = 100): BoardBox => ({ id, position: { x, y }, measured: { width: w, height: h } });

  it('the selected panels in an even grid, reading order, from the selection\'s top-left corner', () => {
    // A messy scatter of four: b sits right of a on the same row (within half a panel), d below.
    const at = new Map(tidySelectionPositions([n('d', 500, 400), n('b', 900, 130, 200), n('a', 300, 100), n('c', 50, 420, 100, 150)]).map((m) => [m.id, m.position]));
    expect([...at.keys()]).toEqual(['a', 'b', 'c', 'd']);
    // 2 columns: column 1 is as wide as its widest (a, c: 100), row 1 as tall as its tallest (100).
    expect(at.get('a')).toEqual({ x: 50, y: 100 });
    expect(at.get('b')).toEqual({ x: 50 + 100 + GAP, y: 100 });
    expect(at.get('c')).toEqual({ x: 50, y: 100 + 100 + GAP });
    expect(at.get('d')).toEqual({ x: 50 + 100 + GAP, y: 100 + 100 + GAP });
  });

  it('one panel (or none) is left as it is; hidden panels are skipped', () => {
    expect(tidySelectionPositions([n('a', 0, 0)])).toEqual([]);
    expect(tidySelectionPositions([n('a', 0, 0), { ...n('b', 50, 50), hidden: true }])).toEqual([]);
  });

  it('onGrid rounds to the grid step', () => {
    expect(onGrid({ x: 23, y: -9 }, 16)).toEqual({ x: 16, y: -16 });
  });
});


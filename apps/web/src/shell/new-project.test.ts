import { assetStacks, BOARD_LAYOUT, createBoardProject, presetSets, stackKind, type SizePreset } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { presetBlock, GAP } from '../board/tidy';
import { pictureNode, seedNewProject } from './new-project';

const px = (width: number, height: number) => ({ width, height, unit: 'px' as const });
const presets: SizePreset[] = [
  { id: 'fb-1', teamId: null, group: 'social', name: 'FB post', size: px(1080, 1080), family: 'FB' },
  { id: 'fb-2', teamId: null, group: 'social', name: 'FB cover', size: px(1640, 624), family: 'FB' },
  { id: 'gdn-1', teamId: null, group: 'social', name: 'Medium rectangle', size: px(300, 250), family: 'GDN' },
  { id: 'loose', teamId: null, group: 'social', name: 'Loose', size: px(100, 100) },
];
let n = 0;
const newId = () => `id${++n}`;

describe('seedNewProject (UX C1)', () => {
  it('adds a Preset node per family picked, in a column under Main Comps, each clear of the one above', () => {
    const doc = seedNewProject(createBoardProject('P'), { presets, families: ['FB', 'GDN'], pictures: [] }, newId);
    const sets = presetSets(doc);
    expect(sets.map((s) => [s.label, s.outputs.length])).toEqual([
      ['FB', 2],
      ['GDN', 1],
    ]);
    expect(sets[0]?.board).toEqual(BOARD_LAYOUT.preset);
    expect(sets[1]?.board).toEqual({ x: BOARD_LAYOUT.preset.x, y: BOARD_LAYOUT.preset.y + presetBlock(2).h + GAP });
    expect(doc.outputs.map((o) => [o.label, o.size.width, o.size.height])).toEqual([
      ['FB post', 1080, 1080],
      ['FB cover', 1640, 624],
      ['Medium rectangle', 300, 250],
    ]);
  });

  it('skips a family it does not know', () => {
    const doc = seedNewProject(createBoardProject('P'), { presets, families: ['Nope'], pictures: [] }, newId);
    expect(presetSets(doc)).toEqual([]);
  });

  it('puts vectors into the Logo node and other pictures into the Image node, in the order given', () => {
    const pictures = [
      { id: 'a', label: 'hero', kind: 'image' as const, assetId: 'A' },
      { id: 'b', label: 'logo', kind: 'vector' as const, assetId: 'B' },
      { id: 'c', label: 'second', kind: 'image' as const, assetId: 'C' },
    ];
    const doc = seedNewProject(createBoardProject('P'), { presets, families: [], pictures }, newId);
    const items = (kind: 'logo' | 'image') => assetStacks(doc).find((st) => stackKind(st) === kind)?.items;
    expect(items('logo')).toEqual(['b']);
    expect(items('image')).toEqual(['a', 'c']);
    expect(doc.sources.find((s) => s.id === 'b')?.behavesLike).toBe('logo');
    // Wired into Main Comps like a drop on the card.
    expect(doc.edges.some((e) => e.kind === 'layer' && e.from === 'a')).toBe(true);
  });

  it('pictureNode: vector → logo, image → image', () => {
    expect(pictureNode({ kind: 'vector' })).toBe('logo');
    expect(pictureNode({ kind: 'image' })).toBe('image');
  });
});

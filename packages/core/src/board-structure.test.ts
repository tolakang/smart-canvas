import { describe, expect, it } from 'vitest';
import { boardStructure, createBoardProject } from './board-structure';
import { MAIN, wiredLayers } from './graph';
import { guidesOf } from './guides';
import { languagePairs } from './languages';
import { layerOrderOf, moveLayerGroup } from './layer-order';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { addTextToStack, assetStacks, stackKind } from './stacks';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('page-3 board structure (D49)', () => {
  it('a new project: Logo, Headline (KH/EN), Text, Image, Background, all wired into the Layer Comp', () => {
    const doc = createBoardProject('P');
    // D68: the Logo and Image nodes start empty (no empty slot to fill); the first text is "Text 1".
    expect(assetStacks(doc).map((st) => [stackKind(st), st.items])).toEqual([
      ['logo', []],
      ['text', ['headline']],
      ['image', []],
    ]);
    expect(doc.sources.find((s) => s.id === 'headline')?.label).toBe('Text 1');
    expect(doc.sources.map((s) => s.id)).not.toContain('subject');
    expect(languagePairs(doc)).toHaveLength(1);
    expect(doc.sources.filter((s) => s.behavesLike === 'background')).toHaveLength(1);
    const wired = wiredLayers(doc, MAIN);
    for (const s of doc.sources) expect(wired.has(s.id)).toBe(true);
    expect(guidesOf(doc, MAIN)).toEqual([]); // added when first opened
    expect(doc.compositions[0]?.label).toBe('Layer comp');
    // Repeatable: already in shape.
    expect(boardStructure(doc)).toBe(doc);
  });

  it('an old project: text joins the Text node; loose outputs join a Sizes preset node', () => {
    const doc = { ...project(output()), edges: [...project().edges, { id: 'w', from: MAIN, to: 'o1', kind: 'composition' as const }] };
    const next = boardStructure(doc);
    expect(assetStacks(next).find((st) => stackKind(st) === 'text')?.items).toEqual(['headline']);
    expect(languagePairs(next)).toHaveLength(1); // and a Headline node
    expect(next.presetSets).toEqual([expect.objectContaining({ label: 'Other sizes', outputs: ['o1'] })]);
    expect(next.edges).toContainEqual(expect.objectContaining({ from: MAIN, to: 'o1', kind: 'composition' }));
  });

  it('D48: the layer comp groups can be dragged into another order; every composition follows', () => {
    const doc = createBoardProject('P', { legacySlots: true });
    expect(layerOrderOf(doc)).toEqual(['logo', 'headline', 'elements', 'background']);
    const moved = moveLayerGroup(doc, 'elements', 0);
    expect(layerOrderOf(moved)).toEqual(['elements', 'logo', 'headline', 'background']);
    for (const c of moved.compositions) expect(c.layers[0]).toBe('subject');
    // Back to the default: nothing stored.
    expect(moveLayerGroup(moved, 'elements', 2).layerOrder).toBeUndefined();
  });
});

describe('the D8 shape for tests (legacySlots)', () => {
  it('keeps the empty Subject picture and Logo and the text named Headline', () => {
    const doc = createBoardProject('P', { legacySlots: true });
    expect(assetStacks(doc).map((st) => [stackKind(st), st.items])).toEqual([
      ['logo', ['logo']],
      ['text', ['headline']],
      ['image', ['subject']],
    ]);
    expect(doc.sources.find((s) => s.id === 'headline')?.label).toBe('Headline');
  });
});

describe('Text node slots (D49)', () => {
  it('each slot is its own text layer, wired, with its own box under the last one', () => {
    const doc = createBoardProject('P');
    const card = assetStacks(doc).find((st) => stackKind(st) === 'text');
    if (!card) throw new Error('no text node');
    const next = ok(addTextToStack(doc, card.id, { id: 't2', text: 'សួស្តី' }));
    const t2 = next.sources.find((s) => s.id === 't2');
    expect(t2).toMatchObject({ kind: 'text', behavesLike: 'text', label: 'Text 2', content: { text: 'សួស្តី' } });
    expect(wiredLayers(next, MAIN).has('t2')).toBe(true);
    expect(assetStacks(next).find((st) => st.id === card.id)?.items).toEqual(['headline', 't2']);
    expect(next.compositions[0]?.placements.t2).toEqual({ x: 0.1, y: 0.22, w: 0.8, h: 0.1 });
  });
});

import { describe, expect, it } from 'vitest';
import { boardStructure, createBoardProject } from './board-structure';
import { addComposition } from './compositions';
import { MAIN, wiredLayers } from './graph';
import { guidesOf } from './guides';
import { languagePairs } from './languages';
import { layerOrderOf, moveLayerGroup } from './layer-order';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { addProcess, DEFAULT_OPS } from './processes';
import { addTextToStack, assetStacks, stackKind } from './stacks';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('page-3 board structure (D49)', () => {
  it('a new project: Logo, Headline (KH/EN), Text, Image, Background, all wired into the Layer Comp', () => {
    const doc = createBoardProject('P');
    expect(assetStacks(doc).map((st) => [stackKind(st), st.items])).toEqual([
      ['logo', ['logo']],
      ['text', ['headline']],
      ['image', ['subject']],
    ]);
    expect(languagePairs(doc)).toHaveLength(1);
    expect(doc.sources.filter((s) => s.behavesLike === 'background')).toHaveLength(1);
    const wired = wiredLayers(doc, MAIN);
    for (const s of doc.sources) expect(wired.has(s.id)).toBe(true);
    expect(guidesOf(doc, MAIN)).toEqual([]); // added when first opened
    expect(doc.compositions[0]?.label).toBe('Layer comp');
    // Repeatable: already in shape.
    expect(boardStructure(doc)).toBe(doc);
  });

  it('an old project: processes and other master previews go; text joins the Text node; loose outputs join a Sizes preset node', () => {
    let doc = { ...project(output()), edges: [...project().edges, { id: 'w', from: MAIN, to: 'o1', kind: 'composition' as const }] };
    doc = ok(addProcess(doc, { id: 'p1', op: JSON.parse(JSON.stringify(DEFAULT_OPS.crop)), board: { x: 0, y: 0 } }));
    doc = ok(addComposition(doc, { id: 'c2', label: 'B', board: { x: 0, y: 0 } }));
    doc = { ...doc, edges: doc.edges.map((e) => (e.kind === 'composition' && e.to === 'o1' ? { ...e, id: 'c2->o1', from: 'c2' } : e)) };
    const next = boardStructure(doc);
    expect(next.processes).toEqual([]);
    expect(next.compositions.filter((c) => !c.guide).map((c) => c.id)).toEqual([MAIN]);
    expect(assetStacks(next).find((st) => stackKind(st) === 'text')?.items).toEqual(['headline']);
    expect(languagePairs(next)).toHaveLength(1); // and a Headline node
    expect(next.presetSets).toEqual([expect.objectContaining({ label: 'Sizes', outputs: ['o1'] })]);
    // Its output now follows the master.
    expect(next.edges).toContainEqual(expect.objectContaining({ from: MAIN, to: 'o1', kind: 'composition' }));
  });

  it('D48: the layer comp groups can be dragged into another order; every composition follows', () => {
    const doc = createBoardProject('P');
    expect(layerOrderOf(doc)).toEqual(['logo', 'headline', 'elements', 'background']);
    const moved = moveLayerGroup(doc, 'elements', 0);
    expect(layerOrderOf(moved)).toEqual(['elements', 'logo', 'headline', 'background']);
    for (const c of moved.compositions) expect(c.layers[0]).toBe('subject');
    // Back to the default: nothing stored.
    expect(moveLayerGroup(moved, 'elements', 2).layerOrder).toBeUndefined();
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

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
import { assetStacks } from './stacks';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('page-3 board structure (D49)', () => {
  it('a new project: Logo, Headline (KH/EN), Image, Background, all wired into the Layer Comp with its three layouts', () => {
    const doc = createBoardProject('P');
    expect(doc.sources.filter((s) => s.behavesLike === 'logo')).toHaveLength(1);
    expect(languagePairs(doc)).toHaveLength(1);
    expect(assetStacks(doc)).toHaveLength(1);
    expect(assetStacks(doc)[0]?.items).toEqual(['subject']);
    expect(doc.sources.filter((s) => s.behavesLike === 'background')).toHaveLength(1);
    expect(doc.sources.some((s) => s.kind === 'text')).toBe(false);
    const wired = wiredLayers(doc, MAIN);
    for (const s of doc.sources) expect(wired.has(s.id)).toBe(true);
    expect(guidesOf(doc, MAIN).map((g) => g.guide?.family).sort()).toEqual(['horizontal', 'vertical']);
    for (const g of guidesOf(doc, MAIN)) expect(g.layers).toEqual(doc.compositions[0]?.layers);
    expect(doc.compositions[0]?.label).toBe('Layer comp');
    // Repeatable: already in shape.
    expect(boardStructure(doc)).toBe(doc);
  });

  it('an old project: text, processes and other master previews go; loose outputs join a Sizes preset node', () => {
    let doc = { ...project(output()), edges: [...project().edges, { id: 'w', from: MAIN, to: 'o1', kind: 'composition' as const }] };
    doc = ok(addProcess(doc, { id: 'p1', op: structuredClone(DEFAULT_OPS.crop), board: { x: 0, y: 0 } }));
    doc = ok(addComposition(doc, { id: 'c2', label: 'B', board: { x: 0, y: 0 } }));
    doc = { ...doc, edges: doc.edges.map((e) => (e.kind === 'composition' && e.to === 'o1' ? { ...e, id: 'c2->o1', from: 'c2' } : e)) };
    const next = boardStructure(doc);
    expect(next.processes).toEqual([]);
    expect(next.compositions.filter((c) => !c.guide).map((c) => c.id)).toEqual([MAIN]);
    expect(next.sources.some((s) => s.id === 'headline')).toBe(false); // the text headline
    expect(languagePairs(next)).toHaveLength(1); // a Headline node instead
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

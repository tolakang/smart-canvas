import { describe, expect, it } from 'vitest';
import { addCoreRule, coreRules, deleteCoreRule, guideRows, layerComp, layerRule, layerRuleText, setCoreRuleComposition } from './core-rules';
import { addComposition, deleteComposition } from './compositions';
import { MAIN } from './graph';
import { addGuides } from './guides';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('Core Rule nodes (D47)', () => {
  it('adds, retargets and deletes a node; a node whose master preview is gone is dropped', () => {
    let doc = ok(addCoreRule(project(), { id: 'r1', board: { x: 10.4, y: -3.6 } }));
    expect(coreRules(doc)).toEqual([{ id: 'r1', composition: MAIN, board: { x: 10, y: -4 } }]);
    expect(addCoreRule(doc, { id: 'r2', board: { x: 0, y: 0 }, composition: 'nope' }).ok).toBe(false);
    doc = ok(addComposition(doc, { id: 'c2', label: 'B', board: { x: 0, y: 0 } }));
    doc = ok(setCoreRuleComposition(doc, 'r1', 'c2'));
    expect(coreRules(doc)[0]?.composition).toBe('c2');
    expect(coreRules(ok(deleteComposition(doc, 'c2')))).toEqual([]);
    expect(ok(deleteCoreRule(doc, 'r1')).coreRules).toBeUndefined();
  });

  it('layer comp: the rows in their groups, front to back (D45)', () => {
    const groups = layerComp(project(), MAIN);
    expect(groups.map((g) => [g.group, g.layers.map((l) => l.id)])).toEqual([
      ['logo', ['logo']],
      ['headline', ['headline']],
      ['elements', ['subject']],
      ['background', ['background']],
    ]);
  });

  it('auto layout rule per layer (D38): cover, stretch on one axis, or scale from its pin', () => {
    expect(layerRule({ behavesLike: 'background' }, undefined)).toEqual({ kind: 'cover' });
    expect(layerRule({ behavesLike: 'subject' }, { x: 0, y: 0, w: 1, h: 1 })).toEqual({ kind: 'cover' });
    expect(layerRule({ behavesLike: 'decoration' }, { x: 0, y: 0.8, w: 1, h: 0.2 })).toEqual({ kind: 'stretch', axis: 'x' });
    expect(layerRule({ behavesLike: 'decoration' }, { x: 0.4, y: 0, w: 0.2, h: 1 })).toEqual({ kind: 'stretch', axis: 'y' });
    const subject = layerRule({ behavesLike: 'subject' }, { x: 0.05, y: 0.7, w: 0.2, h: 0.2 });
    expect(subject).toEqual({ kind: 'scale', pin: { x: 'start', y: 'end' } });
    expect(layerRuleText(subject)).toBe('Scales, pinned bottom left');
    expect(layerRuleText(layerRule({ behavesLike: 'logo' }, { x: 0, y: 0, w: 1, h: 0.1 }))).toBe('Scales, pinned top centre (minimum size)');
    expect(layerRuleText(layerRule({ behavesLike: 'text' }, { x: 0.3, y: 0.4, w: 0.4, h: 0.2 }))).toBe('Scales, pinned centre');
    expect(layerRuleText({ kind: 'stretch', axis: 'x' })).toBe('Stretches edge to edge across');
  });

  it('core preset guide: the master holds its own shape; guides the others, with the outputs using each (D42)', () => {
    const p = project();
    const base: ProjectDoc = {
      ...p,
      outputs: [output({ id: 'sq' }), output({ id: 'tall', size: { width: 1080, height: 1920, unit: 'px' } }), output({ id: 'wide', size: { width: 728, height: 90, unit: 'px' } })],
      edges: [...p.edges, ...['sq', 'tall', 'wide'].map((o) => ({ id: `w-${o}`, from: MAIN, to: o, kind: 'composition' as const }))],
    };
    expect(guideRows(base, MAIN).map((r) => [r.family, r.composition?.id, r.outputs])).toEqual([
      ['square', MAIN, 3],
      ['vertical', undefined, 0],
      ['horizontal', undefined, 0],
    ]);
    const doc = ok(addGuides(base, MAIN, { vertical: 'gv', horizontal: 'gh' }));
    expect(guideRows(doc, MAIN).map((r) => [r.family, r.composition?.id, r.outputs])).toEqual([
      ['square', MAIN, 1],
      ['vertical', 'gv', 1],
      ['horizontal', 'gh', 1],
    ]);
    // A guide's node shows its master's rows.
    expect(guideRows(doc, 'gv')).toEqual(guideRows(doc, MAIN));
  });
});

import { describe, expect, it } from 'vitest';
import { addCoreRule, coreRules, deleteCoreRule, guideRows, layerComp, layerRule, layerRuleText, setCoreRuleComposition, setOutputLayout } from './core-rules';
import { guideFor } from './guides';
import { canvasMetrics } from './model';
import { masterScene } from './render';
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

  it('core preset guide: each output in the section closest to its shape, or the one chosen for it (D42, D50)', () => {
    const p = project();
    const base: ProjectDoc = {
      ...p,
      outputs: [output({ id: 'sq' }), output({ id: 'tall', size: { width: 1080, height: 1920, unit: 'px' } }), output({ id: 'wide', size: { width: 728, height: 90, unit: 'px' } })],
      edges: [...p.edges, ...['sq', 'tall', 'wide'].map((o) => ({ id: `w-${o}`, from: MAIN, to: o, kind: 'composition' as const }))],
    };
    const rows = (d: ProjectDoc) => guideRows(d, MAIN).map((r) => [r.family, r.composition?.id, r.outputs.map((o) => o.id)]);
    expect(rows(base)).toEqual([
      ['square', MAIN, ['sq']],
      ['vertical', undefined, ['tall']],
      ['horizontal', undefined, ['wide']],
    ]);
    // Assigning the wide banner to the vertical layout adds that layout; the banner now follows it.
    const doc = ok(setOutputLayout(base, 'wide', 'vertical', 'gv'));
    expect(rows(doc)).toEqual([
      ['square', MAIN, ['sq']],
      ['vertical', 'gv', ['tall', 'wide']],
      ['horizontal', undefined, []],
    ]);
    expect(guideRows(doc, MAIN)[1]?.outputs.map((o) => o.chosen)).toEqual([false, true]);
    expect(guideFor(doc, MAIN, canvasMetrics(doc.outputs[2] ?? output()).trim, 'vertical')?.id).toBe('gv');
    // Back to auto.
    expect(rows(ok(setOutputLayout(doc, 'wide', null, 'x')))[2]).toEqual(['horizontal', undefined, ['wide']]);
    // A guide's node shows its master's rows.
    expect(guideRows(doc, 'gv')).toEqual(guideRows(doc, MAIN));
  });

  it('a layout of the master draws the master’s layers, at its own positions or the master’s (D50)', () => {
    const doc = ok(addGuides(project(), MAIN, { vertical: 'gv' }));
    const withNew = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, placements: { ...c.placements, extra: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } } } : c)) };
    const ids = masterScene(withNew, 'gv').items.map((i) => i.sourceId).sort();
    expect(ids).toEqual(masterScene(withNew, MAIN).items.map((i) => i.sourceId).sort());
  });
});

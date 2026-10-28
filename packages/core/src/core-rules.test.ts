import { describe, expect, it } from 'vitest';
import { guideRows, layerComp, setOutputLayout } from './core-rules';
import { guideFor } from './guides';
import { canvasMetrics } from './model';
import { masterScene } from './render';
import { MAIN } from './graph';
import { addGuides } from './guides';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('Export Group data (D47, D49, D66)', () => {
  it('layer comp: the rows in their groups, front to back (D45)', () => {
    const groups = layerComp(project(), MAIN);
    expect(groups.map((g) => [g.group, g.layers.map((l) => l.id)])).toEqual([
      ['logo', ['logo']],
      ['headline', ['headline']],
      ['elements', ['subject']],
      ['background', ['background']],
    ]);
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

import { describe, expect, it } from 'vitest';
import { addComposition } from './compositions';
import { outputComposition } from './graph';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { deleteOutput, disconnectOutput, isOutputConnected } from './outputs';
import { addPresetSet, addSizeToSet, connectSet, deletePresetSet, moveSetRow, presetFamilies, presetSets, setComposition, setPreviewHidden } from './preset-sets';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const px = (width: number, height: number) => ({ width, height, unit: 'px' as const });
const GDN = [
  { id: 'g1', label: 'GDN 1200×628', size: px(1200, 628) },
  { id: 'g2', label: 'GDN 300×250', size: px(300, 250) },
  { id: 'g3', label: 'GDN 728×90', size: px(728, 90) },
];
const deps = { measure: (t: string, f: number) => t.length * 0.5 * f, assets: {} };
const withSet = () => ok(addPresetSet({ ...project(output()), outputs: [] }, { id: 'gdn', label: 'GDN', board: { x: 800, y: 0 }, sizes: GDN }));

describe('Preset nodes (D46)', () => {
  it('adds one output per size, all following the master preview, previews in a column to the right', () => {
    const doc = withSet();
    expect(presetSets(doc)).toEqual([{ id: 'gdn', label: 'GDN', board: { x: 800, y: 0 }, outputs: ['g1', 'g2', 'g3'] }]);
    expect(doc.outputs.map((o) => [o.label, o.board])).toEqual([
      ['GDN 1200×628', { x: 1220, y: 0 }],
      ['GDN 300×250', { x: 1220, y: 380 }],
      ['GDN 728×90', { x: 1220, y: 760 }],
    ]);
    for (const o of ['g1', 'g2', 'g3']) expect(outputComposition(doc, o)).toBe('main');
  });

  it('adds sizes as rows, re-orders rows, and drops a deleted output\'s row', () => {
    let doc = ok(addSizeToSet(withSet(), 'gdn', { id: 'g4', label: 'GDN 320×100', size: px(320, 100) }));
    expect(presetSets(doc)[0]?.outputs).toEqual(['g1', 'g2', 'g3', 'g4']);
    expect(outputComposition(doc, 'g4')).toBe('main');
    doc = ok(moveSetRow(doc, 'gdn', 'g4', 0));
    expect(presetSets(doc)[0]?.outputs).toEqual(['g4', 'g1', 'g2', 'g3']);
    doc = ok(deleteOutput(doc, 'g1'));
    expect(doc.presetSets?.[0]?.outputs).toEqual(['g4', 'g2', 'g3']);
  });

  it('one wire feeds every size: rewired to another master preview, frozen ones reconnect', () => {
    let doc = ok(addComposition(withSet(), { id: 'v2', label: 'Variant' }));
    doc = ok(disconnectOutput(doc, 'g2', deps));
    expect(isOutputConnected(doc, 'g2')).toBe(false);
    doc = ok(connectSet(doc, 'gdn', 'v2'));
    for (const o of ['g1', 'g2', 'g3']) expect(outputComposition(doc, o)).toBe('v2');
    expect(doc.outputs.find((o) => o.id === 'g2')?.frozen).toBeUndefined();
    expect(setComposition(doc, 'gdn')).toBe('v2');
  });

  it('deleting the node deletes its sizes; other outputs stay', () => {
    const base = project(output());
    const doc = ok(deletePresetSet(ok(addPresetSet(base, { id: 'gdn', label: 'GDN', board: { x: 0, y: 0 }, sizes: GDN })), 'gdn'));
    expect(doc.outputs.map((o) => o.id)).toEqual(['o1']);
    expect(doc.presetSets).toBeUndefined();
  });

  it('N5: families from each preset’s family field (not its name); presets without one are single sizes', () => {
    const fams = presetFamilies([{ name: 'GDN 1200×628', family: 'GDN' }, { name: 'Banner', family: 'GDN' }, { name: 'Website 1600×385', family: 'Website' }, { name: 'Instagram square' }, { name: 'Gift 1500×400' }, { name: 'x', family: '  ' }]);
    expect(fams.map((f) => [f.label, f.presets.length])).toEqual([['GDN', 2], ['Website', 1]]);
  });
});

describe('Preview visibility (D51)', () => {
  it('hides and shows a size’s Preview; nothing stored when all show', () => {
    const doc = withSet();
    const hidden = ok(setPreviewHidden(doc, 'gdn', 'g2', true));
    expect(presetSets(hidden)[0]?.hidden).toEqual(['g2']);
    expect(ok(setPreviewHidden(hidden, 'gdn', 'g2', false)).presetSets?.[0]).not.toHaveProperty('hidden');
    // Not one of its sizes: unchanged.
    expect(presetSets(ok(setPreviewHidden(doc, 'gdn', 'nope', true)))[0]).not.toHaveProperty('hidden');
  });
});

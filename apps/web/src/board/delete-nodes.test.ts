import { addComposition, addCoreRule, addPresetSet, addOutput, addProcess, connectProcessInput, createProjectDoc, DEFAULT_OPS, createGroup, outputDefaults, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { deletableNodes, deleteNodes, deleteQuestion } from './delete-nodes';
import { groupNodeId, inputNodeId, MAIN_ID, outputNodeId, processNodeId } from './flow';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

function sample(): ProjectDoc {
  let d = createProjectDoc('P');
  d = ok(addProcess(d, { id: 'p1', op: structuredClone(DEFAULT_OPS.crop), board: { x: 0, y: 0 } }));
  d = ok(connectProcessInput(d, 'p1', 'subject'));
  d = ok(addComposition(d, { id: 'c2', label: 'Variant B', board: { x: 0, y: 0 } }));
  d = ok(addOutput(d, { id: 'o1', label: 'Square', size: { width: 1080, height: 1080, unit: 'px' }, ...outputDefaults('px'), composition: 'main', board: { x: 0, y: 0 } }));
  return d;
}

describe('Delete key on the board', () => {
  it('lists what can go (not the first master preview), with one question', () => {
    const d = sample();
    const t = deletableNodes(d, [inputNodeId('logo'), MAIN_ID, 'comp:c2', outputNodeId('o1'), processNodeId('p1')]);
    expect(t.map((x) => x.kind)).toEqual(['input', 'composition', 'output', 'process']);
    expect(deleteQuestion(t.slice(0, 1))).toBe('Delete “Logo”? Their wires and output overrides go with them.');
    expect(deleteQuestion(t)).toMatch(/^Delete 4 nodes\?/);
  });

  it('deletes them all in one doc change; a process already gone with its input is skipped', () => {
    const d = sample();
    const next = ok(deleteNodes(d, deletableNodes(d, [inputNodeId('subject'), processNodeId('p1'), outputNodeId('o1'), 'comp:c2'])));
    expect(next.sources.some((s) => s.id === 'subject')).toBe(false);
    expect(next.processes.some((p) => p.id === 'p1')).toBe(false);
    expect(next.outputs).toHaveLength(0);
    expect(next.compositions.map((c) => c.id)).toEqual(['main']);
  });

  it('a group frame is ungrouped, its nodes stay', () => {
    const d = ok(createGroup(sample(), { id: 'g1', label: 'G', nodes: ['logo', 'headline'] }));
    const next = ok(deleteNodes(d, deletableNodes(d, [groupNodeId('g1')])));
    expect(next.groups ?? []).toHaveLength(0);
    expect(next.sources.some((s) => s.id === 'logo')).toBe(true);
  });

  it('nothing deletable → no change', () => expect(deleteNodes(sample(), deletableNodes(sample(), [MAIN_ID])).ok).toBe(false));
});

describe('Delete key on a Preset node (D46)', () => {
  it('deletes the node with all its sizes', () => {
    const d = ok(addPresetSet(sample(), { id: 's1', label: 'GDN', board: { x: 0, y: 0 }, sizes: [{ id: 'g1', label: 'GDN 300×250', size: { width: 300, height: 250, unit: 'px' } }] }));
    const t = deletableNodes(d, ['set:s1']);
    expect(t).toEqual([{ kind: 'preset', id: 's1', label: 'GDN' }]);
    const next = ok(deleteNodes(d, t));
    expect(next.presetSets).toBeUndefined();
    expect(next.outputs.map((o) => o.id)).toEqual(['o1']);
  });
});

describe('Delete key on a Core Rule node (D47)', () => {
  it('deletes only the node', () => {
    const d = ok(addCoreRule(sample(), { id: 'r1', board: { x: 0, y: 0 } }));
    const t = deletableNodes(d, ['rule:r1']);
    expect(t).toEqual([{ kind: 'rule', id: 'r1', label: 'Core rules' }]);
    const next = ok(deleteNodes(d, t));
    expect(next.coreRules).toBeUndefined();
    expect(next.compositions).toEqual(d.compositions);
  });
});

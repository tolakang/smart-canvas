import { describe, expect, it } from 'vitest';
import { boardGroups, createGroup, groupOf, ungroup, updateGroup } from './groups';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { addLanguagePair } from './languages';
import { addPresetSet } from './preset-sets';
import { deleteSource } from './sources';
import { addStack } from './stacks';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const doc = () => ({ ...project(), outputs: [output({ id: 'o1' }), output({ id: 'o2' })] });

describe('board groups (T13.7)', () => {
  it('groups existing nodes, picks an unused colour, one group per node', () => {
    let d = ok(createGroup(doc(), { id: 'g1', label: ' Social ', nodes: ['o1', 'o2', 'nope'] }));
    expect(d.groups).toEqual([{ id: 'g1', label: 'Social', color: 'blue', nodes: ['o1', 'o2'] }]);
    d = ok(createGroup(d, { id: 'g2', label: 'Brand', nodes: ['logo', 'o2'] }));
    expect(boardGroups(d)).toEqual([
      { id: 'g1', label: 'Social', color: 'blue', nodes: ['o1'] },
      { id: 'g2', label: 'Brand', color: 'purple', nodes: ['logo', 'o2'] },
    ]);
    expect(groupOf(d, 'o2')?.id).toBe('g2');
    expect(createGroup(d, { id: 'g3', label: 'x', nodes: ['nope'] }).ok).toBe(false);
  });

  it('rename, recolour, collapse; ungroup keeps the nodes; members that go are dropped', () => {
    let d = ok(createGroup(doc(), { id: 'g1', label: 'Social', nodes: ['o1', 'headline'] }));
    d = ok(updateGroup(d, 'g1', { label: 'Feeds', color: 'green', collapsed: true }));
    expect(d.groups?.[0]).toEqual({ id: 'g1', label: 'Feeds', color: 'green', nodes: ['o1', 'headline'], collapsed: true });
    d = ok(updateGroup(d, 'g1', { collapsed: false }));
    expect(d.groups?.[0]?.collapsed).toBeUndefined();
    expect(updateGroup(d, 'g1', { color: 'pink' as never }).ok).toBe(false);
    const gone = ok(deleteSource(d, 'headline'));
    expect(boardGroups(gone)[0]?.nodes).toEqual(['o1']);
    const none = ok(ungroup(d, 'g1'));
    expect(none.groups).toBeUndefined();
    expect(none.outputs).toHaveLength(2);
  });

  it('page-3 panels can be grouped: asset and Headline nodes, Preset nodes (their ids, not their items)', () => {
    let d = ok(addStack(doc(), { id: 'imgs', kind: 'image', board: { x: 0, y: 0 } }));
    d = ok(addLanguagePair(d, { id: 'hl', km: 'hk', en: 'he', board: { x: 0, y: 0 } }));
    d = ok(addPresetSet(d, { id: 'gdn', label: 'GDN', board: { x: 0, y: 0 }, sizes: [{ id: 'g1', label: 'GDN 300×250', size: { width: 300, height: 250, unit: 'px' } }] }));
    d = ok(createGroup(d, { id: 'g', label: 'Top row', nodes: ['imgs', 'hl', 'gdn'] }));
    expect(boardGroups(d)[0]?.nodes).toEqual(['imgs', 'hl', 'gdn']);
    expect(groupOf(d, 'gdn')?.id).toBe('g');
  });
});

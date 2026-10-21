import { describe, expect, it } from 'vitest';
import { boardGroups, createGroup, groupOf, groupOutputs, ungroup, updateGroup } from './groups';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { deleteSource } from './sources';
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
    expect(groupOutputs(d, 'g2')).toEqual(['o2']);
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
});

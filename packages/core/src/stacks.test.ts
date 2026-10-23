import { describe, expect, it } from 'vitest';
import { mainComposition, wiredLayers } from './graph';
import type { ProjectDoc } from './model';
import { createProjectDoc } from './project';
import { addPicturesToStack, addStack, assetStacks, deleteStack, dropGrid, moveStackItem, stackCompositions } from './stacks';
import { deleteSource, duplicateSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const pics = (...ids: string[]) => ids.map((id) => ({ id, label: `${id}.png`, kind: 'image' as const, assetId: `asset-${id}` }));
const withCard = () => ok(addStack(createProjectDoc('P'), { id: 'st', board: { x: -500, y: 0 } }));

describe('Assets cards (D40)', () => {
  it('a new card is empty, named Assets, and feeds the master preview', () => {
    const doc = withCard();
    expect(assetStacks(doc)).toEqual([{ id: 'st', label: 'Image', board: { x: -500, y: 0 }, items: [] }]);
    expect(stackCompositions(doc, 'st')).toEqual(['main']);
  });

  it('dropping several pictures makes one input each, with its file, wired into the master preview, first file in front', () => {
    const doc = ok(addPicturesToStack(withCard(), 'st', pics('a', 'b', 'c')));
    expect(assetStacks(doc)[0]?.items).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) {
      const s = doc.sources.find((x) => x.id === id);
      expect(s).toMatchObject({ kind: 'image', behavesLike: 'subject', label: `${id}.png`, content: { assetId: `asset-${id}` } });
      expect(wiredLayers(doc, 'main').has(id)).toBe(true);
      expect(mainComposition(doc).placements[id]).toBeDefined();
    }
    expect(mainComposition(doc).layers.slice(0, 3)).toEqual(['a', 'b', 'c']);
  });

  it('one drop is laid out in a grid on the master, so every picture shows', () => {
    const [one] = dropGrid(1);
    for (const [k, v] of Object.entries({ x: 0.14, y: 0.14, w: 0.72, h: 0.72 })) expect(one?.[k as 'x']).toBeCloseTo(v, 9);
    const cells = dropGrid(3); // 2 columns × 2 rows
    expect(cells.map((c) => [c.x, c.y].map((v) => Math.round(v * 100) / 100))).toEqual([[0.12, 0.12], [0.52, 0.12], [0.12, 0.52]]);
    const doc = ok(addPicturesToStack(withCard(), 'st', pics('a', 'b', 'c')));
    expect(mainComposition(doc).placements.b).toEqual(cells[1]);
  });

  it('reorders inside the card; deleting or duplicating a picture keeps the card in step', () => {
    let doc = ok(addPicturesToStack(withCard(), 'st', pics('a', 'b', 'c')));
    doc = ok(moveStackItem(doc, 'st', 'c', 0));
    expect(assetStacks(doc)[0]?.items).toEqual(['c', 'a', 'b']);
    doc = ok(deleteSource(doc, 'a'));
    expect(doc.stacks?.[0]?.items).toEqual(['c', 'b']); // stored without it, not only filtered on read
    doc = ok(duplicateSource(doc, 'c', 'c2'));
    expect(assetStacks(doc)[0]?.items).toEqual(['c', 'c2', 'b']);
  });

  it('deleting the card deletes its pictures; other inputs stay', () => {
    const before = withCard();
    const doc = ok(deleteStack(ok(addPicturesToStack(before, 'st', pics('a', 'b'))), 'st'));
    expect(doc.stacks).toBeUndefined();
    expect(doc.sources.map((s) => s.id)).toEqual(before.sources.map((s) => s.id));
    expect(doc.edges).toEqual(before.edges);
  });

  it('refuses unknown cards and taken ids', () => {
    expect(addPicturesToStack(withCard(), 'nope', pics('a'))).toEqual({ ok: false, error: 'not_found' });
    expect(addStack(withCard(), { id: 'st', board: { x: 0, y: 0 } })).toEqual({ ok: false, error: 'invalid' });
    expect(addStack(withCard(), { id: 'logo', board: { x: 0, y: 0 } })).toEqual({ ok: false, error: 'invalid' });
  });
});

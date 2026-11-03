import { describe, expect, it } from 'vitest';
import { mainComposition, wiredLayers } from './graph';
import { layerSources } from './layers';
import { addLogoSet, deleteLogoSet, logoSetInUse, setLogoSet, unusedLogoInputs } from './logo-sets';
import type { ProjectDoc } from './model';
import { createProjectDoc } from './project';
import { addPicturesToStack, addStack, assetStacks } from './stacks';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const logoNode = () => {
  const doc = ok(addStack(createProjectDoc('P'), { id: 'lg', kind: 'logo', board: { x: -500, y: 0 } }));
  return ok(addPicturesToStack(doc, 'lg', [{ id: 'a', label: 'brand.svg', kind: 'vector', assetId: 'asset-a' }]));
};
const stack = (doc: ProjectDoc) => {
  const st = assetStacks(doc).find((s) => s.id === 'lg');
  if (!st) throw new Error('no Logo node');
  return st;
};
const hidden = (doc: ProjectDoc) => layerSources(doc).filter((s) => !s.visible).map((s) => s.id);

describe('Logo sets (D77)', () => {
  it('a Logo node with one set draws it; nothing is switched off', () => {
    const doc = logoNode();
    expect(logoSetInUse(stack(doc))).toBe('a');
    expect(unusedLogoInputs(doc).size).toBe(0);
  });

  it('Add logo set adds an empty logo row, wired like the first, in its box (unfitted); the first set stays in use', () => {
    let doc = logoNode();
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === 'main' ? { ...c, placements: { ...c.placements, a: { x: 0.1, y: 0.2, w: 0.3, h: 0.1, fitted: true } } } : c)) };
    doc = ok(addLogoSet(doc, 'lg', 'b'));
    expect(stack(doc).items).toEqual(['a', 'b']);
    expect(doc.sources.find((s) => s.id === 'b')).toMatchObject({ behavesLike: 'logo', label: 'Logo 2', content: { kind: 'image' } });
    expect(wiredLayers(doc, 'main').has('b')).toBe(true);
    expect(mainComposition(doc).placements.b).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
    expect(logoSetInUse(stack(doc))).toBe('a');
    expect(hidden(doc)).toEqual(['b']);
  });

  it('switching the set draws only the new one, in the old one’s place; switching back restores it', () => {
    let doc = ok(addLogoSet(logoNode(), 'lg', 'b'));
    const before = mainComposition(doc).placements.a;
    doc = ok(setLogoSet(doc, 'lg', 'b'));
    expect(stack(doc).use).toBe('b');
    expect(hidden(doc)).toEqual(['a']);
    expect(mainComposition(doc).placements.b).toMatchObject({ x: before?.x, y: before?.y, w: before?.w, h: before?.h });
    doc = ok(setLogoSet(doc, 'lg', 'a'));
    // The first row is the default: no `use` is stored for it.
    expect(stack(doc).use).toBeUndefined();
    expect(hidden(doc)).toEqual(['b']);
  });

  it('deleting the set in use hands its place to the next one; deleting another set leaves the one in use', () => {
    let doc = ok(addLogoSet(ok(addLogoSet(logoNode(), 'lg', 'b')), 'lg', 'c'));
    doc = ok(setLogoSet(doc, 'lg', 'b'));
    const place = mainComposition(doc).placements.b;
    doc = ok(deleteLogoSet(doc, 'lg', 'b'));
    expect(stack(doc).items).toEqual(['a', 'c']);
    expect(logoSetInUse(stack(doc))).toBe('c');
    expect(mainComposition(doc).placements.c).toMatchObject({ x: place?.x, y: place?.y });
    doc = ok(deleteLogoSet(doc, 'lg', 'a'));
    expect(stack(doc).items).toEqual(['c']);
    expect(stack(doc).use).toBeUndefined();
    expect(hidden(doc)).toEqual([]);
  });

  it('refuses an unknown node or row, and an Image node', () => {
    const doc = ok(addStack(logoNode(), { id: 'img', board: { x: 0, y: 0 } }));
    expect(setLogoSet(doc, 'lg', 'zz').ok).toBe(false);
    expect(addLogoSet(doc, 'img', 'x').ok).toBe(false);
    expect(deleteLogoSet(doc, 'nope', 'a').ok).toBe(false);
  });
});

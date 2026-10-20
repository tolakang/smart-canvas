import { describe, expect, it } from 'vitest';
import { layerOrder } from './graph';
import { addSourceFromLibrary, isValidLibraryEntry, libraryEntryOf } from './library';
import { LIMITS, type ProjectDoc } from './model';
import { createProjectDoc } from './project';
import { addSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const logo = { id: 'lib1', name: 'Brand logo', kind: 'vector' as const, behavesLike: 'logo' as const, content: { kind: 'vector' as const, assetId: 'a1', focal: { x: 0.5, y: 0.5 } } };

describe('team library', () => {
  it('saves a source as a detached entry', () => {
    const doc = createProjectDoc('P');
    const headline = doc.sources.find((s) => s.id === 'headline');
    if (!headline) throw new Error('no headline');
    const entry = libraryEntryOf(headline, '  Tagline  ');
    expect(entry).toMatchObject({ name: 'Tagline', kind: 'text', behavesLike: 'text' });
    expect(entry.content).toEqual(headline.content);
    expect(entry.content).not.toBe(headline.content);
  });

  it('adds a detached copy that remembers its library item', () => {
    const doc = ok(addSourceFromLibrary(createProjectDoc('P'), logo, 's9'));
    const added = doc.sources.find((s) => s.id === 's9');
    expect(added).toMatchObject({ label: 'Brand logo', kind: 'vector', behavesLike: 'logo', libraryItemId: 'lib1', content: logo.content });
    expect(layerOrder(doc)[0]).toBe(added?.id); // in front
    expect(added?.content).not.toBe(logo.content);
  });

  it('respects the input cap and the kind/behaviour rules', () => {
    let doc = createProjectDoc('P');
    while (doc.sources.length < LIMITS.maxSources) doc = ok(addSource(doc, { id: `x${doc.sources.length}`, label: 'x', kind: 'fill', behavesLike: 'decoration' }));
    expect(addSourceFromLibrary(doc, logo, 's9')).toEqual({ ok: false, error: 'limit' });
    expect(isValidLibraryEntry({ ...logo, behavesLike: 'text' })).toBe(false);
    expect(isValidLibraryEntry({ ...logo, content: { kind: 'fill', fill: { type: 'solid', color: '#fff' } } })).toBe(false);
  });
});

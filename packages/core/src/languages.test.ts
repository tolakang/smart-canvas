import { describe, expect, it } from 'vitest';
import { MAIN, mainComposition, wiredLayers } from './graph';
import { addLanguagePair, deletePair, languagePairs, pairOf, setLanguage, unusedLanguageInputs } from './languages';
import { computeLayout } from './layout';
import { mockMeasure, output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { masterScene } from './render';
import { deleteSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const withPictures = (doc: ProjectDoc): ProjectDoc => ({
  ...doc,
  sources: doc.sources.map((s) => (s.id === 'hk' || s.id === 'he') && s.content.kind === 'image' ? { ...s, content: { ...s.content, assetId: `${s.id}.png` } } : s),
});
const card = () => withPictures(ok(addLanguagePair(project(output()), { id: 'h', km: 'hk', en: 'he', board: { x: -500, y: 0 } })));
const drawn = (doc: ProjectDoc) => computeLayout(doc, 'o1', { measure: mockMeasure, assets: {} }).items.map((i) => i.sourceId);

describe('Headline cards: Khmer / English (D44)', () => {
  it('adds two picture inputs, both wired into the master at the same box, Khmer in use', () => {
    const doc = card();
    expect(languagePairs(doc)).toEqual([{ id: 'h', label: 'Headline', board: { x: -500, y: 0 }, km: 'hk', en: 'he', use: 'km' }]);
    expect(doc.sources.filter((s) => s.id === 'hk' || s.id === 'he').map((s) => [s.label, s.kind])).toEqual([
      ['Headline · English', 'image'],
      ['Headline · Khmer', 'image'],
    ]);
    for (const id of ['hk', 'he']) expect(wiredLayers(doc, MAIN).has(id)).toBe(true);
    expect(mainComposition(doc).placements.hk).toEqual(mainComposition(doc).placements.he);
    expect(pairOf(doc, 'he')?.id).toBe('h');
  });

  it('only the language in use is drawn — in outputs and on the master; switching swaps them', () => {
    let doc = card();
    expect([...unusedLanguageInputs(doc)]).toEqual(['he']);
    expect(drawn(doc)).toContain('hk');
    expect(drawn(doc)).not.toContain('he');
    expect(masterScene(doc).items.map((i) => i.sourceId)).not.toContain('he');
    doc = ok(setLanguage(doc, 'h', 'en'));
    expect(drawn(doc)).toContain('he');
    expect(drawn(doc)).not.toContain('hk');
    expect(doc.sources.find((s) => s.id === 'hk')?.visible).toBe(true); // switched off by the card, not hidden
  });

  it('each language keeps its own placement', () => {
    let doc = card();
    const moved = { x: 0.2, y: 0.6, w: 0.5, h: 0.1 };
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, placements: { ...c.placements, he: moved } } : c)) };
    expect(mainComposition(ok(setLanguage(doc, 'h', 'en'))).placements.he).toEqual(moved);
    expect(mainComposition(doc).placements.hk).not.toEqual(moved);
  });

  it('deleting the card deletes both; deleting one language leaves the other an ordinary input', () => {
    const before = project(output());
    expect(ok(deletePair(card(), 'h')).sources.map((s) => s.id)).toEqual(before.sources.map((s) => s.id));
    const one = ok(deleteSource(card(), 'he'));
    expect(languagePairs(one)).toEqual([]);
    expect(one.headlines ?? []).toEqual([]);
    expect(drawn(one)).toContain('hk');
  });

  it('refuses taken ids', () => {
    expect(addLanguagePair(card(), { id: 'h2', km: 'logo', en: 'x', board: { x: 0, y: 0 } })).toEqual({ ok: false, error: 'invalid' });
  });
});

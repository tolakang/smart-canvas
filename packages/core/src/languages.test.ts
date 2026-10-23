import { describe, expect, it } from 'vitest';
import { MAIN, mainComposition, wiredLayers } from './graph';
import { addLanguagePair, addPairRow, deletePair, deletePairRow, languagePairs, pairInputs, setLanguage, unusedLanguageInputs } from './languages';
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

describe('Several pairs in one Headline card (N3)', () => {
  const twoRows = () => ok(addPairRow(card(), 'h', { km: 'hk2', en: 'he2' }));

  it('adds a second pair: two more inputs, wired, in a box below the first; "Use" covers both', () => {
    let doc = twoRows();
    const pair = languagePairs(doc)[0];
    expect(pair?.more).toEqual([{ km: 'hk2', en: 'he2' }]);
    expect(pair && pairInputs(pair)).toEqual(['hk', 'he', 'hk2', 'he2']);
    expect(doc.sources.filter((s) => s.id === 'hk2' || s.id === 'he2').map((s) => s.label).sort()).toEqual(['Headline 2 · English', 'Headline 2 · Khmer']);
    for (const id of ['hk2', 'he2']) expect(wiredLayers(doc, MAIN).has(id)).toBe(true);
    const at = mainComposition(doc).placements;
    expect(at.hk2?.y).toBeGreaterThan((at.hk?.y ?? 0) + (at.hk?.h ?? 0));
    expect(at.hk2).toEqual(at.he2);
    expect([...unusedLanguageInputs(doc)].sort()).toEqual(['he', 'he2']);
    doc = ok(setLanguage(doc, 'h', 'en'));
    expect([...unusedLanguageInputs(doc)].sort()).toEqual(['hk', 'hk2']);
  });

  it('a pair added to a card whose wire is cut stays unwired', () => {
    let doc = card();
    for (const id of ['hk', 'he']) doc = { ...doc, edges: doc.edges.filter((e) => !(e.kind === 'layer' && e.from === id)) };
    doc = ok(addPairRow(doc, 'h', { km: 'hk2', en: 'he2' }));
    expect(wiredLayers(doc, MAIN).has('hk2')).toBe(false);
  });

  it('deleting a pair deletes its two inputs; deleting the first lets the next lead; the last one deletes the card', () => {
    let doc = ok(addPairRow(twoRows(), 'h', { km: 'hk3', en: 'he3' }));
    doc = ok(deletePairRow(doc, 'h', 1));
    expect(doc.sources.some((s) => s.id === 'hk2' || s.id === 'he2')).toBe(false);
    expect(languagePairs(doc)[0]?.more).toEqual([{ km: 'hk3', en: 'he3' }]);
    doc = ok(deletePairRow(doc, 'h', 0));
    expect(languagePairs(doc)).toEqual([{ id: 'h', label: 'Headline', board: { x: -500, y: 0 }, km: 'hk3', en: 'he3', use: 'km' }]);
    doc = ok(deletePairRow(doc, 'h', 0));
    expect(languagePairs(doc)).toEqual([]);
    expect(doc.sources.some((s) => s.id === 'hk3')).toBe(false);
  });

  it('deleting one language of a later pair drops that pair from the card (the other stays an input); deleting the card deletes all', () => {
    let doc = ok(deleteSource(twoRows(), 'he2'));
    expect(languagePairs(doc)[0]?.more).toBeUndefined();
    expect(doc.sources.some((s) => s.id === 'hk2')).toBe(true);
    doc = ok(deletePair(twoRows(), 'h'));
    expect(doc.sources.some((s) => ['hk', 'he', 'hk2', 'he2'].includes(s.id))).toBe(false);
  });

  it('refuses taken ids and an unknown card', () => {
    expect(addPairRow(card(), 'h', { km: 'hk', en: 'x' }).ok).toBe(false);
    expect(addPairRow(card(), 'nope', { km: 'a', en: 'b' }).ok).toBe(false);
    expect(deletePairRow(card(), 'h', 3).ok).toBe(false);
  });
});

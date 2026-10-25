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

  it('V4: the pair shares one layout — switching hands the picture coming in the place of the one going out', () => {
    let doc = card();
    const moved = { x: 0.2, y: 0.6, w: 0.5, h: 0.1, rotation: 12, fitted: true as const };
    const stale = { x: 0.9, y: 0.9, w: 0.05, h: 0.05 };
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, placements: { ...c.placements, hk: moved, he: stale } } : c)) };
    doc = ok(setLanguage(doc, 'h', 'en'));
    // Same box and rotation; unfitted so the English picture fits into it (D37).
    const { fitted: _f, ...box } = moved;
    void _f;
    expect(mainComposition(doc).placements.he).toEqual(box);
    // And back: the English one's place (moved meanwhile) goes to Khmer.
    const again = { x: 0.1, y: 0.1, w: 0.3, h: 0.2 };
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, placements: { ...c.placements, he: again } } : c)) };
    expect(mainComposition(ok(setLanguage(doc, 'h', 'km'))).placements.hk).toEqual(again);
  });

  it('V4: each Preview’s edit and frozen frame go with the switch too; a Preview without one has none after', () => {
    let doc = card();
    const edit = { sourceId: 'hk', frame: { x: 10, y: 20 }, updatedBy: 'u', updatedAt: '2026-10-25T00:00:00Z' };
    const old = { ...edit, sourceId: 'he', frame: { x: 900, y: 900 } };
    doc = { ...doc, outputs: doc.outputs.map((o) => ({ ...o, overrides: [edit, old], frozen: { items: [{ sourceId: 'hk', frame: { x: 1, y: 2, w: 3, h: 4 } }] } })) };
    doc = ok(setLanguage(doc, 'h', 'en'));
    const o = doc.outputs[0];
    expect(o?.overrides.filter((x) => x.sourceId === 'he')).toEqual([{ ...edit, sourceId: 'he' }]);
    expect(o?.frozen?.items.find((i) => i.sourceId === 'he')?.frame).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    // Back to Khmer with no English edit: Khmer's old edit goes (one layout, the current one).
    doc = { ...doc, outputs: doc.outputs.map((x) => ({ ...x, overrides: x.overrides.filter((v) => v.sourceId !== 'he') })) };
    expect(ok(setLanguage(doc, 'h', 'km')).outputs[0]?.overrides.some((x) => x.sourceId === 'hk')).toBe(false);
  });

  it('V4: with the pictures measured, switching keeps the size exactly — no shrinking however often it is switched', () => {
    // A 4:1 Khmer picture and a 6:1 English one, both with a transparent margin.
    const assets = {
      'hk.png': { width: 800, height: 240, trim: { x: 0, y: 1 / 12, w: 1, h: 10 / 12 } },
      'he.png': { width: 1200, height: 240, trim: { x: 0, y: 1 / 12, w: 1, h: 10 / 12 } },
    };
    let doc = card();
    const start = { x: 0.1, y: 0.2, w: 0.6, h: 0.15, rotation: 8, fitted: true as const };
    const edit = { sourceId: 'hk', frame: { x: 100, y: 200, w: 600, h: 150, fitted: true as const }, updatedBy: 'u', updatedAt: '2026-10-25T00:00:00Z' };
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, placements: { ...c.placements, hk: start } } : c)), outputs: doc.outputs.map((o) => ({ ...o, overrides: [edit] })) };
    const area = (f: { w: number; h: number }) => f.w * f.h;
    const master = mainComposition(doc).size;
    for (let i = 0; i < 6; i++) doc = ok(setLanguage(doc, 'h', i % 2 ? 'km' : 'en', assets));
    // Six switches: back on Khmer, exactly where it started, in the master and in the Preview's edit.
    const back = mainComposition(doc).placements.hk;
    for (const k of ['x', 'y', 'w', 'h', 'rotation'] as const) expect(back?.[k]).toBeCloseTo(start[k], 9);
    const ov = doc.outputs[0]?.overrides.find((o) => o.sourceId === 'hk')?.frame;
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(ov?.[k]).toBeCloseTo(edit.frame[k], 6);
    // On English: the same centre and area (in design px), in its own wider shape, fitted (not refitted smaller).
    doc = ok(setLanguage(doc, 'h', 'en', assets));
    const en = mainComposition(doc).placements.he;
    if (!en || !back) throw new Error('no frames');
    expect(en.fitted).toBe(true);
    expect(en.x + en.w / 2).toBeCloseTo(start.x + start.w / 2, 9);
    expect(en.y + en.h / 2).toBeCloseTo(start.y + start.h / 2, 9);
    expect(area(en)).toBeCloseTo(area(start), 9);
    const px = (f: { w: number; h: number }) => (f.w * master.width) / (f.h * master.height);
    expect(px(en) / px(start)).toBeCloseTo(6 / 4, 6);
  });

  it('V4: choosing the language already in use changes nothing', () => {
    const doc = card();
    expect(ok(setLanguage(doc, 'h', 'km'))).toEqual(doc);
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

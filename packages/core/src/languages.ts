/**
 * Headline cards (D44, PDF page 3 "Headline asset Node"): the same headline as a Khmer picture and an English
 * picture. Each is its own input — its own placement, fit and output overrides, so each keeps its adjusted
 * transform — and only the one in use is drawn (master previews, outputs, exports): switching the card swaps
 * every output. N3: a card can hold more pairs (`more`, each its own two layers); "Use" applies to all of them.
 * Pure; ids are passed in.
 */
import { MAIN, withComposition } from './graph';
import type { LanguagePair, ProjectDoc } from './model';
import { connectSource } from './ports';
import { addSource, deleteSource, type SourceResult } from './sources';

export const LANGUAGE_LABEL = { km: 'Khmer', en: 'English' } as const;

export interface LanguageRow {
  km: string;
  en: string;
}

/** A card's pairs, first one first (N3). */
export const pairRows = (p: LanguagePair): LanguageRow[] => [{ km: p.km, en: p.en }, ...(p.more ?? [])];

/** Every input of a card: both languages of every pair. */
export const pairInputs = (p: LanguagePair): string[] => pairRows(p).flatMap((r) => [r.km, r.en]);

/** The cards whose first two inputs still exist (and of their other pairs, the ones whose two inputs exist). */
export function languagePairs(doc: ProjectDoc): LanguagePair[] {
  const ids = new Set(doc.sources.map((s) => s.id));
  return (doc.headlines ?? []).flatMap((p) => {
    if (!ids.has(p.km) || !ids.has(p.en)) return [];
    if (!p.more) return [p];
    const more = p.more.filter((r) => ids.has(r.km) && ids.has(r.en));
    if (more.length === p.more.length) return [p];
    const { more: _more, ...rest } = p;
    void _more;
    return [more.length ? { ...rest, more } : rest];
  });
}

/** The inputs a card has switched off (the language not in use, in every pair). */
export function unusedLanguageInputs(doc: ProjectDoc): Set<string> {
  return new Set(languagePairs(doc).flatMap((p) => pairRows(p).map((r) => (p.use === 'km' ? r.en : r.km))));
}

/** The card an input belongs to, if any. */
export const pairOf = (doc: ProjectDoc, sourceId: string): LanguagePair | undefined => languagePairs(doc).find((p) => pairInputs(p).includes(sourceId));

const withPairs = (doc: ProjectDoc, pairs: LanguagePair[]): ProjectDoc => {
  const next = { ...doc };
  if (pairs.length) next.headlines = pairs;
  else delete next.headlines;
  return next;
};

/** The default headline box on the master: the middle-top band (as the default Headline input). */
const HEADLINE_BOX = { x: 0.08, y: 0.08, w: 0.84, h: 0.2 };

/**
 * Adds a Headline card: two picture inputs (Khmer, English), both wired into the master preview at the same
 * box, Khmer in use. One result, so one undo step.
 */
export function addLanguagePair(doc: ProjectDoc, spec: { id: string; km: string; en: string; board: { x: number; y: number }; label?: string }): SourceResult {
  if ([spec.id, spec.km, spec.en].some((id) => doc.sources.some((s) => s.id === id) || (doc.headlines ?? []).some((p) => p.id === id))) return { ok: false, error: 'invalid' };
  const label = spec.label?.trim() || 'Headline';
  let next = doc;
  for (const [id, lang] of [[spec.en, 'en'], [spec.km, 'km']] as const) {
    const added = addSource(next, { id, kind: 'image', label: `${label} · ${LANGUAGE_LABEL[lang]}`, behavesLike: 'subject', board: spec.board });
    if (!added.ok) return added;
    const wired = connectSource(added.doc, id);
    if (!wired.ok) return wired;
    next = withComposition(wired.doc, MAIN, (c) => ({ ...c, placements: { ...c.placements, [id]: { ...HEADLINE_BOX } } }));
  }
  const pair: LanguagePair = { id: spec.id, label, board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) }, km: spec.km, en: spec.en, use: 'km' };
  return { ok: true, doc: withPairs(next, [...languagePairs(next), pair]) };
}

const editPair = (doc: ProjectDoc, id: string, edit: (p: LanguagePair) => LanguagePair): SourceResult => {
  const pairs = languagePairs(doc);
  if (!pairs.some((p) => p.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withPairs(doc, pairs.map((p) => (p.id === id ? edit(p) : p))) };
};

/**
 * N3: adds another Khmer / English pair to card `id` — two picture inputs, wired into the master like the
 * card's first pair (when that one is wired), in a box below the card's last one. One undo step.
 */
export function addPairRow(doc: ProjectDoc, id: string, row: LanguageRow): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  if (!pair || row.km === row.en || [row.km, row.en].some((x) => doc.sources.some((s) => s.id === x) || (doc.headlines ?? []).some((p) => p.id === x))) return { ok: false, error: 'invalid' };
  const n = pairRows(pair).length + 1;
  const wired = doc.edges.some((e) => e.kind === 'layer' && e.from === pair.km && e.to === MAIN);
  const box = { ...HEADLINE_BOX, y: Math.min(HEADLINE_BOX.y + (n - 1) * (HEADLINE_BOX.h + 0.02), 1 - HEADLINE_BOX.h) };
  let next = doc;
  for (const [sid, lang] of [[row.en, 'en'], [row.km, 'km']] as const) {
    const added = addSource(next, { id: sid, kind: 'image', label: `${pair.label} ${n} · ${LANGUAGE_LABEL[lang]}`, behavesLike: 'subject', board: pair.board });
    if (!added.ok) return added;
    next = added.doc;
    if (wired) {
      const w = connectSource(next, sid);
      if (!w.ok) return w;
      next = withComposition(w.doc, MAIN, (c) => ({ ...c, placements: { ...c.placements, [sid]: { ...box } } }));
    }
  }
  return editPair(next, id, (p) => ({ ...p, more: [...(p.more ?? []), { km: row.km, en: row.en }] }));
}

/** N3: deletes pair `index` of card `id` (both its inputs); the card's first pair can go while others are left. */
export function deletePairRow(doc: ProjectDoc, id: string, index: number): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  const row = pair && pairRows(pair)[index];
  if (!pair || !row) return { ok: false, error: 'not_found' };
  if (pairRows(pair).length === 1) return deletePair(doc, id);
  let next = doc;
  for (const s of [row.km, row.en]) {
    const r = deleteSource(next, s);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: next };
}

/** Switches which language every output draws. */
export function setLanguage(doc: ProjectDoc, id: string, use: 'km' | 'en'): SourceResult {
  return editPair(doc, id, (p) => (p.use === use ? p : { ...p, use }));
}

export function renamePair(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return editPair(doc, id, (p) => (clean ? { ...p, label: clean } : p));
}

/** Places a card on the board. */
export function movePair(doc: ProjectDoc, id: string, board: { x: number; y: number }): SourceResult {
  return editPair(doc, id, (p) => ({ ...p, board: { x: Math.round(board.x), y: Math.round(board.y) } }));
}

/** Deletes a card with all its inputs. */
export function deletePair(doc: ProjectDoc, id: string): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  if (!pair) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const s of pairInputs(pair)) {
    const r = deleteSource(next, s);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: withPairs(next, languagePairs(next).filter((p) => p.id !== id)) };
}

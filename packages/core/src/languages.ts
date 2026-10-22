/**
 * Headline cards (D44, PDF page 3 "Headline asset Node"): the same headline as a Khmer picture and an English
 * picture. Each is its own input — its own placement, fit and output overrides, so each keeps its adjusted
 * transform — and only the one in use is drawn (master previews, outputs, exports): switching the card swaps
 * every output. Pure; ids are passed in.
 */
import { MAIN, withComposition } from './graph';
import type { LanguagePair, ProjectDoc } from './model';
import { connectSource } from './ports';
import { addSource, deleteSource, type SourceResult } from './sources';

export const LANGUAGE_LABEL = { km: 'Khmer', en: 'English' } as const;

/** The cards whose two inputs still exist. */
export function languagePairs(doc: ProjectDoc): LanguagePair[] {
  const ids = new Set(doc.sources.map((s) => s.id));
  return (doc.headlines ?? []).filter((p) => ids.has(p.km) && ids.has(p.en));
}

/** The inputs a card has switched off (the language not in use). */
export function unusedLanguageInputs(doc: ProjectDoc): Set<string> {
  return new Set(languagePairs(doc).map((p) => (p.use === 'km' ? p.en : p.km)));
}

/** The card an input belongs to, if any. */
export const pairOf = (doc: ProjectDoc, sourceId: string): LanguagePair | undefined => languagePairs(doc).find((p) => p.km === sourceId || p.en === sourceId);

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

/** Deletes a card with both its inputs. */
export function deletePair(doc: ProjectDoc, id: string): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  if (!pair) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const s of [pair.km, pair.en]) {
    const r = deleteSource(next, s);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: withPairs(next, languagePairs(next).filter((p) => p.id !== id)) };
}

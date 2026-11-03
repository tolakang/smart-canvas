/**
 * Headline cards (D44, PDF page 3 "Headline asset Node"): the same headline as a Khmer picture and an English
 * picture, two inputs of which only the one in use is drawn (the master and its layouts, outputs, exports):
 * switching the card swaps every output. V4 (2026-10-25, owner: "Both assets must use only one data, only asset
 * switch between En and Kh"; amends D44): the pair shares one layout — switching hands the language coming in the
 * place, size, rotation, editor history and every Preview's edits of the one going out, so only the picture
 * changes. N3: a card can hold more pairs (`more`, each its own two layers); "Use" applies to all of them.
 * Pure; ids are passed in.
 */
import { pictureAspect } from './fit';
import { MAIN, withComposition } from './graph';
import { layerSources } from './layers';
import type { AssetSize } from './layout/types';
import type { LanguagePair, ProjectDoc } from './model';
import { sizeInDesignPx } from './render';
import { connectSource } from './ports';
import { addSource, deleteSource, type SourceResult } from './sources';

/** D78: a Language node's languages, in the order they show. */
export const LANGUAGES = ['km', 'en', 'zh'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];
export const LANGUAGE_LABEL = { km: 'Khmer', en: 'English', zh: 'Chinese' } as const;
/** The short names on the switch and the slot headings. */
export const LANGUAGE_SHORT = { km: 'KH', en: 'EN', zh: 'CN' } as const;

export interface LanguageRow {
  km: string;
  en: string;
  /** D78: older rows have no Chinese input until one is added (`addLanguageInput`). */
  zh?: string;
}

/** A card's rows, first one first (N3). */
export const pairRows = (p: LanguagePair): LanguageRow[] => [{ km: p.km, en: p.en, ...(p.zh ? { zh: p.zh } : {}) }, ...(p.more ?? [])];

/** A row's inputs, in language order (a missing Chinese one left out). */
export const rowInputs = (r: LanguageRow): string[] => LANGUAGES.flatMap((l) => (r[l] ? [r[l] as string] : []));

/** Every input of a card: every language of every row. */
export const pairInputs = (p: LanguagePair): string[] => pairRows(p).flatMap(rowInputs);

/** A row without a Chinese input that no longer exists. */
const keepZh = <R extends { zh?: string }>(r: R, ids: Set<string>): R => {
  if (!r.zh || ids.has(r.zh)) return r;
  const { zh: _zh, ...rest } = r;
  void _zh;
  return rest as R;
};

/**
 * The cards whose first Khmer and English inputs still exist (and of their other rows, the ones whose Khmer and
 * English inputs exist); a Chinese input that is gone is dropped from its row.
 */
export function languagePairs(doc: ProjectDoc): LanguagePair[] {
  const ids = new Set(doc.sources.map((s) => s.id));
  return (doc.headlines ?? []).flatMap((p) => {
    if (!ids.has(p.km) || !ids.has(p.en)) return [];
    const lead = keepZh(p, ids);
    if (!p.more) return [lead];
    const more = p.more.filter((r) => ids.has(r.km) && ids.has(r.en)).map((r) => keepZh(r, ids));
    const { more: _more, ...rest } = lead;
    void _more;
    return [more.length ? { ...rest, more } : rest];
  });
}

/** The inputs a card has switched off: every language not in use, in every row. */
export function unusedLanguageInputs(doc: ProjectDoc): Set<string> {
  return new Set(languagePairs(doc).flatMap((p) => pairRows(p).flatMap((r) => LANGUAGES.flatMap((l) => (l !== p.use && r[l] ? [r[l] as string] : [])))));
}

/** A row's name: its Khmer input's name without the language (" · Khmer"). */
export function rowName(doc: ProjectDoc, r: LanguageRow): string {
  const label = doc.sources.find((s) => s.id === r.km)?.label ?? '';
  return label.replace(/ · (Khmer|English|Chinese)$/, '');
}

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
export function addLanguagePair(doc: ProjectDoc, spec: { id: string; km: string; en: string; zh?: string; board: { x: number; y: number }; label?: string; row?: string }): SourceResult {
  const ids = [spec.id, spec.km, spec.en, ...(spec.zh ? [spec.zh] : [])];
  if (new Set(ids).size !== ids.length || ids.some((id) => doc.sources.some((s) => s.id === id) || (doc.headlines ?? []).some((p) => p.id === id))) return { ok: false, error: 'invalid' };
  const label = spec.label?.trim() || 'Language';
  const row = spec.row?.trim() || 'Headline';
  let next = doc;
  for (const [id, lang] of [...(spec.zh ? [[spec.zh, 'zh'] as const] : []), [spec.en, 'en'], [spec.km, 'km']] as const) {
    const added = addSource(next, { id, kind: 'image', label: `${row} · ${LANGUAGE_LABEL[lang]}`, behavesLike: 'subject', board: spec.board });
    if (!added.ok) return added;
    const wired = connectSource(added.doc, id);
    if (!wired.ok) return wired;
    next = withComposition(wired.doc, MAIN, (c) => ({ ...c, placements: { ...c.placements, [id]: { ...HEADLINE_BOX } } }));
  }
  const pair: LanguagePair = { id: spec.id, label, board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) }, km: spec.km, en: spec.en, ...(spec.zh ? { zh: spec.zh } : {}), use: 'km' };
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
export function addPairRow(doc: ProjectDoc, id: string, row: LanguageRow, name?: string): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  const ids = rowInputs(row);
  if (!pair || new Set(ids).size !== ids.length || ids.some((x) => doc.sources.some((s) => s.id === x) || (doc.headlines ?? []).some((p) => p.id === x))) return { ok: false, error: 'invalid' };
  const n = pairRows(pair).length + 1;
  const wired = doc.edges.some((e) => e.kind === 'layer' && e.from === pair.km && e.to === MAIN);
  const box = { ...HEADLINE_BOX, y: Math.min(HEADLINE_BOX.y + (n - 1) * (HEADLINE_BOX.h + 0.02), 1 - HEADLINE_BOX.h) };
  const rowLabel = name?.trim() || `Asset ${n}`;
  let next = doc;
  for (const [sid, lang] of [...(row.zh ? [[row.zh, 'zh'] as const] : []), [row.en, 'en'], [row.km, 'km']] as const) {
    const added = addSource(next, { id: sid, kind: 'image', label: `${rowLabel} · ${LANGUAGE_LABEL[lang]}`, behavesLike: 'subject', board: pair.board });
    if (!added.ok) return added;
    next = added.doc;
    if (wired) {
      const w = connectSource(next, sid);
      if (!w.ok) return w;
      next = withComposition(w.doc, MAIN, (c) => ({ ...c, placements: { ...c.placements, [sid]: { ...box } } }));
    }
  }
  return editPair(next, id, (p) => ({ ...p, more: [...(p.more ?? []), { km: row.km, en: row.en, ...(row.zh ? { zh: row.zh } : {}) }] }));
}

/** N3: deletes pair `index` of card `id` (both its inputs); the card's first pair can go while others are left. */
export function deletePairRow(doc: ProjectDoc, id: string, index: number): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  const row = pair && pairRows(pair)[index];
  if (!pair || !row) return { ok: false, error: 'not_found' };
  if (pairRows(pair).length === 1) return deletePair(doc, id);
  let next = doc;
  for (const s of rowInputs(row)) {
    const r = deleteSource(next, s);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: next };
}

/**
 * Switches which language every output draws. `assets` (the pictures' measured sizes, as in LayoutDeps) lets the
 * language coming in take the exact size of the one going out (`shareLayout`); without them its frames are left
 * to be fitted by the board.
 */
export function setLanguage(doc: ProjectDoc, id: string, use: LanguageCode, assets?: Record<string, AssetSize>): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  if (!pair || pair.use === use) return editPair(doc, id, (p) => p);
  // V4: one layout for each row — the language coming in takes over the one going out's (a row with no input in the
  // language going out, an old row without Chinese, hands over its Khmer one's).
  const next = pairRows(pair).reduce((d, r) => {
    const from = r[pair.use] ?? r.km;
    const to = r[use];
    return to && to !== from ? shareLayout(d, from, to, assets) : d;
  }, doc);
  return editPair(next, id, (p) => ({ ...p, use }));
}

/**
 * D78: gives row `index` of card `id` its missing input in `lang` (an older row's Chinese one): a picture input
 * named after the row, wired and placed like the row's Khmer one (unfitted, so its picture fits that box).
 */
export function addLanguageInput(doc: ProjectDoc, id: string, index: number, lang: LanguageCode, sid: string): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  const row = pair && pairRows(pair)[index];
  if (!pair || !row || row[lang] || doc.sources.some((s) => s.id === sid) || (doc.headlines ?? []).some((p) => p.id === sid)) return { ok: false, error: 'invalid' };
  const added = addSource(doc, { id: sid, kind: 'image', label: `${rowName(doc, row)} · ${LANGUAGE_LABEL[lang]}`, behavesLike: 'subject', board: pair.board });
  if (!added.ok) return added;
  let next = added.doc;
  for (const e of doc.edges.filter((x) => x.kind === 'layer' && x.from === row.km)) {
    const w = connectSource(next, sid, undefined, e.to);
    if (!w.ok) return w;
    next = withComposition(w.doc, e.to, (c) => {
      const own = c.placements[row.km];
      if (!own) return c;
      const { fitted: _f, ...box } = own;
      void _f;
      return { ...c, placements: { ...c.placements, [sid]: box } };
    });
  }
  return editPair(next, id, (p) => (index === 0 ? { ...p, [lang]: sid } : { ...p, more: (p.more ?? []).map((r, i) => (i === index - 1 ? { ...r, [lang]: sid } : r)) }));
}

/** D78: renames row `index` of card `id`: each of its inputs is named "<name> · <language>". */
export function renameLanguageRow(doc: ProjectDoc, id: string, index: number, name: string): SourceResult {
  const pair = languagePairs(doc).find((p) => p.id === id);
  const row = pair && pairRows(pair)[index];
  const clean = name.trim();
  if (!pair || !row) return { ok: false, error: 'not_found' };
  if (!clean) return { ok: true, doc };
  const names = new Map(LANGUAGES.flatMap((l) => (row[l] ? [[row[l] as string, `${clean} · ${LANGUAGE_LABEL[l]}`] as const] : [])));
  return { ok: true, doc: { ...doc, sources: doc.sources.map((s) => (names.has(s.id) ? { ...s, label: names.get(s.id) as string } : s)) } };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * The frame `to`'s picture takes from `from`'s: the same centre, turn and lean, the same area and the same stretch
 * (how far the frame is from the picture's own shape), in `to`'s own proportions. It maps back exactly, so switching
 * Khmer → English → Khmer gives the first frame again — no drift. (`ka`, `kb`: the two pictures' visible aspects.)
 */
export function swapFrame<F extends Box & { fitted?: true }>(f: F, ka: number, kb: number): F {
  const area = f.w * f.h;
  const stretch = f.w / f.h / ka;
  const aspect = kb * stretch;
  const w = Math.sqrt(area * aspect);
  const h = Math.sqrt(area / aspect);
  return { ...f, x: f.x + f.w / 2 - w / 2, y: f.y + f.h / 2 - h / 2, w, h, fitted: true };
}

/**
 * V4: `to` takes `from`'s layout everywhere it is kept — its frame in every composition (the master and its
 * layouts), and in every output its override and frozen frame. With both pictures' sizes known the frames are
 * `swapFrame`d (fitted, exact, reversible); otherwise they are handed over unfitted for the board to fit (D37).
 * `to`'s editor histories are dropped (they described its old box). Where `from` has none, `to` has none either.
 */
export function shareLayout(doc: ProjectDoc, from: string, to: string, assets?: Record<string, AssetSize>): ProjectDoc {
  const layers = layerSources(doc);
  const aspectOf = (id: string) => {
    const l = layers.find((s) => s.id === id);
    return l && assets ? pictureAspect(l, assets) : undefined;
  };
  const [ka, kb] = [aspectOf(from), aspectOf(to)];
  /** A whole frame for `to`, in px of its scene (sx, sy: the scene's size; placements are 0..1). */
  const take = <F extends Box & { fitted?: true }>(f: F, sx = 1, sy = 1): F => {
    if (ka && kb && f.fitted) {
      const g = swapFrame({ ...f, x: f.x * sx, y: f.y * sy, w: f.w * sx, h: f.h * sy }, ka, kb);
      return { ...g, x: g.x / sx, y: g.y / sy, w: g.w / sx, h: g.h / sy };
    }
    const { fitted: _f, ...rest } = f;
    void _f;
    return rest as F;
  };
  const without = <T>(rec: Record<string, T>): Record<string, T> => {
    const { [to]: _old, ...rest } = rec;
    void _old;
    return rest;
  };
  const dropHistory = <T extends { layers: Record<string, unknown> }>(t: T | undefined) => (t ? { transforms: { ...t, layers: without(t.layers) } } : {});
  return {
    ...doc,
    compositions: doc.compositions.map((c) => {
      const { width: W, height: H } = sizeInDesignPx(c.size);
      const own = c.placements[from];
      return { ...c, placements: { ...without(c.placements), ...(own ? { [to]: take(own, W, H) } : {}) }, ...dropHistory(c.transforms) };
    }),
    outputs: doc.outputs.map((o) => {
      const own = o.overrides.find((x) => x.sourceId === from);
      const f = own?.frame;
      // A whole frame is swapped; a partial one (a nudge, a hide) is handed over as it is.
      const frame = f && f.x !== undefined && f.y !== undefined && f.w !== undefined && f.h !== undefined ? take({ ...f, x: f.x, y: f.y, w: f.w, h: f.h }) : f;
      const overrides = [...o.overrides.filter((x) => x.sourceId !== to), ...(own ? [{ ...own, sourceId: to, ...(frame ? { frame } : {}) }] : [])];
      const frozen = o.frozen && {
        ...o.frozen,
        items: [...o.frozen.items.filter((i) => i.sourceId !== to), ...o.frozen.items.filter((i) => i.sourceId === from).map((i) => ({ ...i, sourceId: to, frame: take(i.frame) }))],
      };
      return { ...o, overrides, ...(frozen ? { frozen } : {}), ...dropHistory(o.transforms) };
    }),
  };
}

export function renamePair(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return editPair(doc, id, (p) => (clean ? { ...p, label: clean } : p));
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

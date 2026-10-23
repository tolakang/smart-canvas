/**
 * Assets cards (D40): one board node holding many pictures — drop several files at once, each becomes its own
 * input (a layer of its own), wired into the card's master previews. Pure; ids are passed in.
 */
import { MAIN, withComposition } from './graph';
import type { AssetStack, NFrame, ProjectDoc } from './model';
import { connectSource } from './ports';
import { addSource, deleteSource, type SourceResult } from './sources';

/** The cards with only items that still exist (an empty card stays: it waits for files). */
export function assetStacks(doc: ProjectDoc): AssetStack[] {
  const ids = new Set(doc.sources.map((s) => s.id));
  return (doc.stacks ?? []).map((st) => (st.items.every((i) => ids.has(i)) ? st : { ...st, items: st.items.filter((i) => ids.has(i)) }));
}

/** The card an input is drawn in, if any. */
export function stackOf(doc: ProjectDoc, sourceId: string): AssetStack | undefined {
  return assetStacks(doc).find((st) => st.items.includes(sourceId));
}

const withStacks = (doc: ProjectDoc, stacks: AssetStack[]): ProjectDoc => {
  const next = { ...doc };
  if (stacks.length) next.stacks = stacks;
  else delete next.stacks;
  return next;
};

const editStack = (doc: ProjectDoc, id: string, edit: (st: AssetStack) => AssetStack): SourceResult => {
  const stacks = assetStacks(doc);
  if (!stacks.some((st) => st.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withStacks(doc, stacks.map((st) => (st.id === id ? edit(st) : st))) };
};

/** D49: a card's default name by what it holds. */
export const STACK_LABEL = { image: 'Image', logo: 'Logo', text: 'Text' } as const;
export const stackKind = (st: Pick<AssetStack, 'kind'>): 'image' | 'logo' | 'text' => st.kind ?? 'image';

export function addStack(doc: ProjectDoc, spec: { id: string; label?: string; board: { x: number; y: number }; kind?: AssetStack['kind'] }): SourceResult {
  if ((doc.stacks ?? []).some((st) => st.id === spec.id) || doc.sources.some((s) => s.id === spec.id)) return { ok: false, error: 'invalid' };
  const stack: AssetStack = {
    id: spec.id,
    label: spec.label?.trim() || STACK_LABEL[spec.kind ?? 'image'],
    board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) },
    items: [],
    ...(spec.kind && spec.kind !== 'image' ? { kind: spec.kind } : {}),
  };
  return { ok: true, doc: withStacks(doc, [...assetStacks(doc), stack]) };
}

export function renameStack(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return editStack(doc, id, (st) => (clean ? { ...st, label: clean } : st));
}

/** The master previews a card feeds: where its items are wired; a card with none wired feeds the master preview. */
export function stackCompositions(doc: ProjectDoc, stackId: string): string[] {
  const items = new Set(assetStacks(doc).find((st) => st.id === stackId)?.items ?? []);
  const comps = [...new Set(doc.edges.filter((e) => e.kind === 'layer' && items.has(e.from) && doc.compositions.some((c) => c.id === e.to)).map((e) => e.to))];
  return comps.length ? comps : [MAIN];
}

export interface StackPicture {
  id: string;
  label: string;
  kind: 'image' | 'vector';
  assetId: string;
}

/**
 * Where the pictures of one drop go on the master: a grid over the middle 80%, one cell each (front to back,
 * row by row), so they all show instead of piling up on one spot. Each picture is later fitted to its visible
 * pixels inside its cell (D37).
 */
export function dropGrid(n: number): NFrame[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const w = 0.8 / cols;
  const h = 0.8 / rows;
  return Array.from({ length: n }, (_, i) => ({ x: 0.1 + (i % cols) * w + 0.05 * w, y: 0.1 + Math.floor(i / cols) * h + 0.05 * h, w: 0.9 * w, h: 0.9 * h }));
}

/**
 * Adds pictures to a card, after its last item: each becomes an input (a subject, in front) with its file, is
 * wired into the card's master previews and placed in a grid there (`dropGrid`). One result, so one undo step
 * for the whole drop.
 */
export function addPicturesToStack(doc: ProjectDoc, stackId: string, pictures: readonly StackPicture[]): SourceResult {
  const stack = assetStacks(doc).find((st) => st.id === stackId);
  if (!stack) return { ok: false, error: 'not_found' };
  const comps = stackCompositions(doc, stackId);
  let next = doc;
  // Added back to front, so the first file ends up in front.
  for (const p of [...pictures].reverse()) {
    // D49: a Logo node's pictures behave as logos (minimum size, the logo group).
    const added = addSource(next, { id: p.id, kind: p.kind, label: p.label, behavesLike: stackKind(stack) === 'logo' ? 'logo' : 'subject', board: stack.board });
    if (!added.ok) return added;
    next = { ...added.doc, sources: added.doc.sources.map((s) => (s.id === p.id && (s.content.kind === 'image' || s.content.kind === 'vector') ? { ...s, content: { ...s.content, assetId: p.assetId } } : s)) };
    for (const comp of comps) {
      const wired = connectSource(next, p.id, undefined, comp);
      if (!wired.ok) return wired;
      next = wired.doc;
    }
  }
  const cells = dropGrid(pictures.length);
  for (const comp of comps) next = withComposition(next, comp, (c) => ({ ...c, placements: { ...c.placements, ...Object.fromEntries(pictures.map((p, i) => [p.id, cells[i] as NFrame])) } }));
  return editStack(next, stackId, (st) => ({ ...st, items: [...st.items, ...pictures.map((p) => p.id)] }));
}

/**
 * D49: a new text slot in a Text node — its own text layer (its own box in each layout, its own overrides),
 * wired where the card's other slots are; the box sits under the last slot's on the master.
 */
export function addTextToStack(doc: ProjectDoc, stackId: string, spec: { id: string; label?: string; text?: string }): SourceResult {
  const stack = assetStacks(doc).find((st) => st.id === stackId);
  if (!stack) return { ok: false, error: 'not_found' };
  const comps = stackCompositions(doc, stackId);
  const added = addSource(doc, { id: spec.id, kind: 'text', label: spec.label?.trim() || `Text ${stack.items.length + 1}`, behavesLike: 'text', board: stack.board });
  if (!added.ok) return added;
  let next = spec.text === undefined ? added.doc : { ...added.doc, sources: added.doc.sources.map((s) => (s.id === spec.id && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: spec.text ?? '' } } : s)) };
  for (const comp of comps) {
    const wired = connectSource(next, spec.id, undefined, comp);
    if (!wired.ok) return wired;
    next = wired.doc;
  }
  const n = stack.items.length;
  const box: NFrame = { x: 0.1, y: Math.min(0.85, 0.1 + n * 0.12), w: 0.8, h: 0.1 };
  for (const comp of comps) next = withComposition(next, comp, (c) => ({ ...c, placements: { ...c.placements, [spec.id]: box } }));
  return editStack(next, stackId, (st) => ({ ...st, items: [...st.items, spec.id] }));
}

/** Moves an item within its card (card order only; layer order is set on the master preview). */
export function moveStackItem(doc: ProjectDoc, stackId: string, sourceId: string, to: number): SourceResult {
  return editStack(doc, stackId, (st) => {
    const items = st.items.filter((i) => i !== sourceId);
    if (items.length === st.items.length) return st;
    items.splice(Math.max(0, Math.min(to, items.length)), 0, sourceId);
    return { ...st, items };
  });
}

/** Wires every picture of a card into a master preview (a wire dragged from the card). */
export function connectStack(doc: ProjectDoc, stackId: string, compositionId: string): SourceResult {
  const stack = assetStacks(doc).find((st) => st.id === stackId);
  if (!stack) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const id of [...stack.items].reverse()) {
    const r = connectSource(next, id, undefined, compositionId);
    if (!r.ok) return r;
    next = r.doc;
  }
  return { ok: true, doc: next };
}

/** Deletes a card and every picture in it. */
export function deleteStack(doc: ProjectDoc, stackId: string): SourceResult {
  const stack = assetStacks(doc).find((st) => st.id === stackId);
  if (!stack) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const id of stack.items) {
    const r = deleteSource(next, id);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: withStacks(next, assetStacks(next).filter((st) => st.id !== stackId)) };
}

/** Places a card on the board. */
export function moveStack(doc: ProjectDoc, stackId: string, board: { x: number; y: number }): SourceResult {
  return editStack(doc, stackId, (st) => ({ ...st, board: { x: Math.round(board.x), y: Math.round(board.y) } }));
}

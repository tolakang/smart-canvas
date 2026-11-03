/**
 * Logo sets (owner, 2026-11-03: "Logo will be group by row, and must smart pick by the format S, V or H. Logo set can
 * be switch to use which row set user want. Logo set can be delete by its row group"). Each row of a Logo node is one
 * set: one logo input whose square picture is its main one and whose vertical and horizontal pictures are D43's
 * `variants` (D74), so every Preview picks the set's picture for its layout. Only the set in `use` is drawn, as a
 * Headline card's language (D44): the others are skipped everywhere. Switching hands the incoming set the outgoing
 * one's place, size and every Preview's edits (`shareLayout`, V4), so only the picture changes. Pure; ids are passed in.
 */
import { withComposition } from './graph';
import { shareLayout } from './languages';
import type { AssetSize } from './layout/types';
import type { AssetStack, NFrame, ProjectDoc } from './model';
import { connectSource } from './ports';
import { addSource, deleteSource, type SourceResult } from './sources';
import { assetStacks, stackCompositions, stackKind } from './stacks';

/** The set a Logo node draws: its `use` while that row exists, else its first row; none for other cards. */
export function logoSetInUse(st: AssetStack): string | undefined {
  if (stackKind(st) !== 'logo') return undefined;
  return st.use && st.items.includes(st.use) ? st.use : st.items[0];
}

/** Every Logo node's rows that are not in use (they are skipped as a Headline's other language is). */
export function unusedLogoInputs(doc: ProjectDoc): Set<string> {
  return new Set(
    assetStacks(doc).flatMap((st) => {
      const use = logoSetInUse(st);
      return use ? st.items.filter((i) => i !== use) : [];
    }),
  );
}

const editLogo = (doc: ProjectDoc, stackId: string, edit: (st: AssetStack) => AssetStack): SourceResult => {
  const stacks = assetStacks(doc);
  const st = stacks.find((x) => x.id === stackId);
  if (!st || stackKind(st) !== 'logo') return { ok: false, error: 'not_found' };
  return { ok: true, doc: { ...doc, stacks: stacks.map((x) => (x.id === stackId ? edit(x) : x)) } };
};

const withUse = (st: AssetStack, use: string | undefined): AssetStack => {
  const { use: _old, ...rest } = st;
  void _old;
  // The first row is the default: it needs no `use`.
  return use && use !== st.items[0] ? { ...rest, use } : rest;
};

/**
 * Draws set `itemId` of Logo node `stackId` everywhere. `assets` (the pictures' measured sizes) let it take the
 * outgoing set's exact frame in its own proportions (`swapFrame`); without them the frame is handed over unfitted.
 */
export function setLogoSet(doc: ProjectDoc, stackId: string, itemId: string, assets?: Record<string, AssetSize>): SourceResult {
  const st = assetStacks(doc).find((x) => x.id === stackId);
  if (!st || stackKind(st) !== 'logo' || !st.items.includes(itemId)) return { ok: false, error: 'not_found' };
  const from = logoSetInUse(st);
  const next = from && from !== itemId ? shareLayout(doc, from, itemId, assets) : doc;
  return editLogo(next, stackId, (x) => withUse(x, itemId));
}

/** The default logo box on the master: top left, small. */
const LOGO_BOX: NFrame = { x: 0.05, y: 0.05, w: 0.18, h: 0.18 };

/**
 * Adds an empty set (a row of three empty slots) after the last one, wired where the node's sets are; it starts
 * in the set in use's box (unfitted, so its picture fits into it). The set in use stays in use. One undo step.
 */
export function addLogoSet(doc: ProjectDoc, stackId: string, id: string, label?: string): SourceResult {
  const st = assetStacks(doc).find((x) => x.id === stackId);
  if (!st || stackKind(st) !== 'logo') return { ok: false, error: 'not_found' };
  const comps = stackCompositions(doc, stackId);
  const added = addSource(doc, { id, kind: 'image', label: label?.trim() || `${st.label} ${st.items.length + 1}`, behavesLike: 'logo', board: st.board });
  if (!added.ok) return added;
  let next = added.doc;
  const use = logoSetInUse(st);
  for (const comp of comps) {
    const wired = connectSource(next, id, undefined, comp);
    if (!wired.ok) return wired;
    next = withComposition(wired.doc, comp, (c) => {
      const own = use ? c.placements[use] : undefined;
      const { fitted: _f, ...box } = own ?? LOGO_BOX;
      void _f;
      return { ...c, placements: { ...c.placements, [id]: box } };
    });
  }
  return editLogo(next, stackId, (x) => {
    const { unwired: _u, ...rest } = x;
    void _u;
    return { ...rest, items: [...x.items, id] };
  });
}

/**
 * Deletes set `itemId` (its three pictures). When it is the set in use and another is left, the next one (or the
 * one before the last) takes its place and its layout first, so the artwork keeps a logo where it was.
 */
export function deleteLogoSet(doc: ProjectDoc, stackId: string, itemId: string, assets?: Record<string, AssetSize>): SourceResult {
  const st = assetStacks(doc).find((x) => x.id === stackId);
  if (!st || stackKind(st) !== 'logo' || !st.items.includes(itemId)) return { ok: false, error: 'not_found' };
  let next = doc;
  if (logoSetInUse(st) === itemId && st.items.length > 1) {
    const i = st.items.indexOf(itemId);
    const heir = st.items[i + 1] ?? st.items[i - 1];
    if (heir) {
      const r = setLogoSet(next, stackId, heir, assets);
      if (r.ok) next = r.doc;
    }
  }
  const r = deleteSource(next, itemId);
  if (!r.ok) return r;
  // A `use` naming the first row again, or a row now gone, is dropped.
  return editLogo(r.doc, stackId, (x) => withUse(x, x.use && x.items.includes(x.use) ? x.use : undefined));
}


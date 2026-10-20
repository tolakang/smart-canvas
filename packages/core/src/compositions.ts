/**
 * Several compositions (D32, T12.3): more "main previews", e.g. one per campaign variant. Each has its own size,
 * placements and rows; outputs wire to the one they follow. The first ('main') always exists and always lists
 * every input as a row; other compositions list only the inputs wired into them.
 */
import { compositionById, MAIN, newComposition, withComposition } from './graph';
import type { LayoutDeps } from './layout';
import { LIMITS, type ProjectDoc, type Size } from './model';
import { disconnectOutput } from './outputs';
import type { SourceResult } from './sources';

/** Board placement for a new composition: below the lowest one. */
export const COMPOSITION_ROW_GAP = 900;

export function canAddComposition(doc: ProjectDoc): boolean {
  return doc.compositions.length < LIMITS.maxCompositions;
}

export function addComposition(doc: ProjectDoc, spec: { id: string; label: string; board?: { x: number; y: number }; size?: Size }): SourceResult {
  if (!canAddComposition(doc)) return { ok: false, error: 'limit' };
  if (compositionById(doc, spec.id) || doc.sources.some((s) => s.id === spec.id) || doc.outputs.some((o) => o.id === spec.id)) return { ok: false, error: 'invalid' };
  const lowest = Math.max(...doc.compositions.map((c) => c.board.y));
  const x = doc.compositions[0]?.board.x ?? 0;
  const board = spec.board ? { x: Math.round(spec.board.x), y: Math.round(spec.board.y) } : { x, y: lowest + COMPOSITION_ROW_GAP };
  return { ok: true, doc: { ...doc, compositions: [...doc.compositions, newComposition(spec.id, spec.label.trim() || 'Main preview', board, spec.size)] } };
}

export function renameComposition(doc: ProjectDoc, id: string, label: string): SourceResult {
  if (!compositionById(doc, id)) return { ok: false, error: 'not_found' };
  const clean = label.trim();
  return { ok: true, doc: clean ? withComposition(doc, id, (c) => ({ ...c, label: clean })) : doc };
}

export function setCompositionSize(doc: ProjectDoc, id: string, size: Size): SourceResult {
  if (!compositionById(doc, id)) return { ok: false, error: 'not_found' };
  if (!(size.width > 0 && size.height > 0 && size.width <= 100_000 && size.height <= 100_000)) return { ok: false, error: 'invalid' };
  return { ok: true, doc: withComposition(doc, id, (c) => ({ ...c, size: { ...size } })) };
}

/** Takes a node out of a composition's rows (not 'main', which lists every input); its wire and placement go too. */
export function removeRow(doc: ProjectDoc, compositionId: string, nodeId: string): SourceResult {
  if (compositionId === MAIN) return { ok: false, error: 'invalid' };
  const comp = compositionById(doc, compositionId);
  if (!comp || !comp.layers.includes(nodeId)) return { ok: false, error: 'not_found' };
  const placements = Object.fromEntries(Object.entries(comp.placements).filter(([id]) => id !== nodeId));
  return {
    ok: true,
    doc: {
      ...withComposition(doc, compositionId, (c) => ({ ...c, layers: c.layers.filter((l) => l !== nodeId), placements })),
      edges: doc.edges.filter((e) => !(e.from === nodeId && e.to === compositionId)),
    },
  };
}

/**
 * Deletes a composition (never 'main'). Outputs wired to it are disconnected first: with `deps` they freeze
 * their current layout (D12), without they fall back to the main preview.
 */
export function deleteComposition(doc: ProjectDoc, id: string, deps?: LayoutDeps): SourceResult {
  if (id === MAIN) return { ok: false, error: 'invalid' };
  if (!compositionById(doc, id)) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const e of doc.edges.filter((x) => x.kind === 'composition' && x.from === id)) {
    if (!deps) continue;
    const r = disconnectOutput(next, e.to, deps);
    if (r.ok) next = r.doc;
  }
  return {
    ok: true,
    doc: { ...next, compositions: next.compositions.filter((c) => c.id !== id), edges: next.edges.filter((e) => e.from !== id && e.to !== id) },
  };
}

/**
 * Rows and input wiring of a composition (D11, D32). A composition's rows are its `layers`, front first
 * (row index = port). A `layer` edge into the composition means the row is connected. Re-ordering is
 * "move this node to row k": the others shift and keep their order.
 */
import { edgeId, isLayerWired, MAIN, withComposition } from './graph';
import type { Edge, ProjectDoc } from './model';
import { ensurePlacement } from './placement';
import type { SourceResult } from './sources';

export { MAIN } from './graph';

export function inputWire(doc: ProjectDoc, sourceId: string, compositionId: string = MAIN): Edge | undefined {
  return doc.edges.find((e) => e.kind === 'layer' && e.from === sourceId && e.to === compositionId);
}

/** Moves a row to `port` (clamped to 0..n-1); rows in between shift by one. */
export function moveSourceToPort(doc: ProjectDoc, sourceId: string, port: number, compositionId: string = MAIN): SourceResult {
  const comp = doc.compositions.find((c) => c.id === compositionId);
  if (!comp || !comp.layers.includes(sourceId)) return { ok: false, error: 'not_found' };
  const order = comp.layers.filter((id) => id !== sourceId);
  const at = Math.max(0, Math.min(Math.round(port), order.length));
  order.splice(at, 0, sourceId);
  return { ok: true, doc: withComposition(doc, compositionId, (c) => ({ ...c, layers: order })) };
}

/**
 * Wires a node into a composition's row. With `port`, the row also moves there (re-wire reorders). A node
 * not yet a row of that composition becomes one (in front, or at `port`). Connecting again just moves it.
 * The first wire auto-places the node by its behaviour if it has no placement yet (Flow 3).
 */
export function connectSource(doc: ProjectDoc, sourceId: string, port?: number, compositionId: string = MAIN): SourceResult {
  const comp = doc.compositions.find((c) => c.id === compositionId);
  if (!comp || !doc.sources.some((s) => s.id === sourceId)) return { ok: false, error: 'not_found' };
  let next = comp.layers.includes(sourceId) ? doc : withComposition(doc, compositionId, (c) => ({ ...c, layers: [sourceId, ...c.layers] }));
  if (port !== undefined) {
    const moved = moveSourceToPort(next, sourceId, port, compositionId);
    if (!moved.ok) return moved;
    next = moved.doc;
  }
  if (isLayerWired(next, sourceId, compositionId)) return { ok: true, doc: next };
  const placed = ensurePlacement(next, sourceId, compositionId);
  return { ok: true, doc: { ...placed, edges: [...placed.edges, { id: edgeId(sourceId, compositionId, 'layer'), from: sourceId, to: compositionId, kind: 'layer' }] } };
}

/** Removes the node's wire into the composition; the node keeps its row (its place in the stack). */
export function disconnectSource(doc: ProjectDoc, sourceId: string, compositionId: string = MAIN): SourceResult {
  if (!doc.sources.some((s) => s.id === sourceId)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: { ...doc, edges: doc.edges.filter((e) => !(e.kind === 'layer' && e.from === sourceId && e.to === compositionId)) } };
}

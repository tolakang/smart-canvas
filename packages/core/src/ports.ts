/**
 * Ports and input wiring (D11, D12). Every source owns a port (0 = front layer); a source→main wire
 * means the source is connected and carries that port. Re-ordering is "move this source to port k":
 * the others shift to keep ports contiguous, and wires follow.
 */
import type { ProjectDoc, Wire } from './model';
import { ensurePlacement } from './placement';
import { withSources, type SourceResult } from './sources';

export const MAIN = 'main';
export const inputWireId = (sourceId: string) => `in:${sourceId}`;

export function inputWire(doc: ProjectDoc, sourceId: string): Wire | undefined {
  return doc.wires.find((w) => w.from === sourceId && w.to === MAIN);
}

/** Moves a source to `port` (clamped to 0..n-1); sources in between shift by one. */
export function moveSourceToPort(doc: ProjectDoc, sourceId: string, port: number): SourceResult {
  const source = doc.sources.find((s) => s.id === sourceId);
  if (!source) return { ok: false, error: 'not_found' };
  const order = [...doc.sources].sort((a, b) => a.port - b.port).filter((s) => s.id !== sourceId);
  const at = Math.max(0, Math.min(Math.round(port), order.length));
  order.splice(at, 0, source);
  const portOf = new Map(order.map((s, i) => [s.id, i]));
  return { ok: true, doc: withSources(doc, doc.sources.map((s) => ({ ...s, port: portOf.get(s.id) ?? s.port }))) };
}

/**
 * Wires a source into the main preview. With `port`, the source also moves there (re-wire reorders).
 * A source has at most one wire into main; connecting again just moves it.
 * First wire auto-places the source by its behaviour if it has no master placement yet (Flow 3).
 */
export function connectSource(doc: ProjectDoc, sourceId: string, port?: number): SourceResult {
  const moved = port === undefined ? { ok: true as const, doc } : moveSourceToPort(doc, sourceId, port);
  if (!moved.ok) return moved;
  const next = moved.doc;
  const source = next.sources.find((s) => s.id === sourceId);
  if (!source) return { ok: false, error: 'not_found' };
  if (inputWire(next, sourceId)) return { ok: true, doc: next };
  const placed = ensurePlacement(next, sourceId);
  return { ok: true, doc: { ...placed, wires: [...placed.wires, { id: inputWireId(sourceId), from: sourceId, to: MAIN, port: source.port }] } };
}

/** Removes the source's wire into main; the source keeps its port (its place in the stack). */
export function disconnectSource(doc: ProjectDoc, sourceId: string): SourceResult {
  if (!doc.sources.some((s) => s.id === sourceId)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: { ...doc, wires: doc.wires.filter((w) => !(w.from === sourceId && w.to === MAIN)) } };
}

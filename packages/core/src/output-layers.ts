/**
 * Output-only layers (D32, T12.4): an output's own `layer` ports, for a layer just one output gets (a price
 * sticker, a legal line). `output.layers` are its rows, front first (row index = port), drawn above the
 * composition's layers while a `layer` edge feeds them. Their default placement comes from their behaviour
 * (ADAPTATION-RULES "Output-only layers"); overrides apply as for any layer.
 */
import { edgeId } from './graph';
import type { OutputNode, ProjectDoc } from './model';
import type { SourceResult } from './sources';

export function outputLayers(doc: ProjectDoc, outputId: string): string[] {
  return doc.outputs.find((o) => o.id === outputId)?.layers ?? [];
}

/** The nodes that feed an output's own rows. */
export function wiredOutputLayers(doc: ProjectDoc, outputId: string): Set<string> {
  return new Set(doc.edges.filter((e) => e.kind === 'layer' && e.to === outputId).map((e) => e.from));
}

const withOutput = (doc: ProjectDoc, id: string, edit: (o: OutputNode) => OutputNode): ProjectDoc => ({ ...doc, outputs: doc.outputs.map((o) => (o.id === id ? edit(o) : o)) });

/** Moves an output row to `port` (clamped); rows in between shift by one. */
export function moveOutputLayer(doc: ProjectDoc, outputId: string, sourceId: string, port: number): SourceResult {
  const rows = outputLayers(doc, outputId);
  if (!rows.includes(sourceId)) return { ok: false, error: 'not_found' };
  const order = rows.filter((id) => id !== sourceId);
  order.splice(Math.max(0, Math.min(Math.round(port), order.length)), 0, sourceId);
  return { ok: true, doc: withOutput(doc, outputId, (o) => ({ ...o, layers: order })) };
}

/** Wires an input into an output's own rows (in front, or at `port`); wiring again just moves the row. */
export function connectOutputLayer(doc: ProjectDoc, outputId: string, sourceId: string, port?: number): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output || !doc.sources.some((s) => s.id === sourceId)) return { ok: false, error: 'not_found' };
  let next = output.layers?.includes(sourceId) ? doc : withOutput(doc, outputId, (o) => ({ ...o, layers: [sourceId, ...(o.layers ?? [])] }));
  if (port !== undefined) {
    const moved = moveOutputLayer(next, outputId, sourceId, port);
    if (!moved.ok) return moved;
    next = moved.doc;
  }
  if (wiredOutputLayers(next, outputId).has(sourceId)) return { ok: true, doc: next };
  return { ok: true, doc: { ...next, edges: [...next.edges, { id: edgeId(sourceId, outputId, 'layer'), from: sourceId, to: outputId, kind: 'layer' }] } };
}

/** Removes an output-only layer: its wire and its row. Its overrides on that output stay, for when it is wired again. */
export function disconnectOutputLayer(doc: ProjectDoc, outputId: string, sourceId: string): SourceResult {
  if (!doc.outputs.some((o) => o.id === outputId)) return { ok: false, error: 'not_found' };
  const next = withOutput(doc, outputId, (o) => {
    const rest = { ...o };
    delete rest.layers;
    const layers = (o.layers ?? []).filter((id) => id !== sourceId);
    return layers.length ? { ...rest, layers } : rest;
  });
  return { ok: true, doc: { ...next, edges: next.edges.filter((e) => !(e.kind === 'layer' && e.from === sourceId && e.to === outputId)) } };
}

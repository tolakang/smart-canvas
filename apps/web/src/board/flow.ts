/**
 * ProjectDoc ↔ React Flow. The doc is the source of truth: node positions live in `board`
 * on each source / the master / each output; edges come from `wires`.
 */
import type { InputSource, OutputNode, ProjectDoc, Wire } from '@smart-canvas/core';
import type { Edge, Node } from '@xyflow/react';

export const MAIN_ID = 'main';
export const inputNodeId = (sourceId: string) => `src:${sourceId}`;
export const outputNodeId = (outputId: string) => `out:${outputId}`;

// Not 'input'/'output': React Flow has built-in node types (and CSS) under those names.
export type InputFlowNode = Node<{ source: InputSource }, 'inputNode'>;
export type MainFlowNode = Node<{ size: ProjectDoc['master']['size']; inputs: number; outputs: number }, 'mainNode'>;
export type OutputFlowNode = Node<{ output: OutputNode; connected: boolean }, 'outputNode'>;
export type BoardNode = InputFlowNode | MainFlowNode | OutputFlowNode;

/** A wire's `from`/`to` are source ids, 'main' or output ids; map them to node ids. */
function endpoint(doc: ProjectDoc, id: string): string {
  if (id === MAIN_ID) return MAIN_ID;
  if (doc.sources.some((s) => s.id === id)) return inputNodeId(id);
  return outputNodeId(id);
}

export function docToNodes(doc: ProjectDoc): BoardNode[] {
  const connected = new Set(doc.wires.filter((w) => w.from === MAIN_ID).map((w) => w.to));
  return [
    ...doc.sources.map(
      (source): InputFlowNode => ({ id: inputNodeId(source.id), type: 'inputNode', position: source.board, data: { source } }),
    ),
    {
      id: MAIN_ID,
      type: 'mainNode',
      position: doc.master.board,
      data: { size: doc.master.size, inputs: doc.sources.length, outputs: doc.outputs.length },
      deletable: false,
    },
    ...doc.outputs.map(
      (output): OutputFlowNode => ({
        id: outputNodeId(output.id),
        type: 'outputNode',
        position: output.board,
        data: { output, connected: connected.has(output.id) },
      }),
    ),
  ];
}

export function docToEdges(doc: ProjectDoc): Edge[] {
  return doc.wires.map((w: Wire) => ({
    id: w.id,
    source: endpoint(doc, w.from),
    target: endpoint(doc, w.to),
    label: w.port === undefined ? undefined : `port ${w.port}`,
  }));
}

/** Returns a new doc with the given node positions written into `board`; unknown ids are ignored. */
export function withPositions(doc: ProjectDoc, moved: { id: string; position: { x: number; y: number } }[]): ProjectDoc {
  if (moved.length === 0) return doc;
  const at = new Map(moved.map((m) => [m.id, { x: Math.round(m.position.x), y: Math.round(m.position.y) }]));
  const place = <T extends { board: { x: number; y: number } }>(item: T, nodeId: string): T => {
    const board = at.get(nodeId);
    return board ? { ...item, board } : item;
  };
  return {
    ...doc,
    master: place(doc.master, MAIN_ID),
    sources: doc.sources.map((s) => place(s, inputNodeId(s.id))),
    outputs: doc.outputs.map((o) => place(o, outputNodeId(o.id))),
  };
}

/**
 * Fresh nodes from the doc, keeping what React Flow owns on the current ones
 * (position while dragging, selection, measured size).
 */
export function syncNodes(current: BoardNode[], fresh: BoardNode[]): BoardNode[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return fresh.map((n) => {
    const prev = byId.get(n.id);
    if (!prev) return n;
    return { ...n, position: prev.position, selected: prev.selected, dragging: prev.dragging, measured: prev.measured } as BoardNode;
  });
}

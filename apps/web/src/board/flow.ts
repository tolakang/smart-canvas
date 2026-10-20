/**
 * ProjectDoc ↔ React Flow. The doc is the source of truth: node positions live in `board`
 * on each source / the main composition / each output; wires come from the doc's typed `edges` (D32).
 * The board shows the main composition (more compositions and process nodes: T12.2+).
 */
import { mainComposition, masterScene, MAIN, withComposition, type Edge as DocEdge, type InputSource, type OutputNode, type ProjectDoc, type RenderScene, type Size } from '@smart-canvas/core';
import type { Edge, Node } from '@xyflow/react';

export const MAIN_ID = MAIN;
export const inputNodeId = (sourceId: string) => `src:${sourceId}`;
export const outputNodeId = (outputId: string) => `out:${outputId}`;

// Not 'input'/'output': React Flow has built-in node types (and CSS) under those names.
export type InputFlowNode = Node<{ source: InputSource }, 'inputNode'>;
/** One row per port on the main preview, front (port 0) first. */
export interface PortRow {
  port: number;
  sourceId: string;
  label: string;
  visible: boolean;
  connected: boolean;
}
export type MainFlowNode = Node<
  {
    size: Size;
    ports: PortRow[];
    inputs: number;
    outputs: number;
    /** What the master looks like now, for the thumbnail (same OutputRenderer as export). */
    scene: RenderScene;
    sources: InputSource[];
  },
  'mainNode'
>;

export const portHandleId = (port: number) => `p${port}`;
export const OUTPUT_HANDLE = 'out';
export function portFromHandle(handle: string | null | undefined): number | undefined {
  const m = handle ? /^p(\d+)$/.exec(handle) : null;
  return m?.[1] === undefined ? undefined : Number(m[1]);
}
export type OutputFlowNode = Node<{ output: OutputNode; connected: boolean }, 'outputNode'>;
export type BoardNode = InputFlowNode | MainFlowNode | OutputFlowNode;

/** An edge's `from`/`to` are source ids, 'main' or output ids; map them to node ids (null: not on this board yet). */
function endpoint(doc: ProjectDoc, id: string): string | null {
  if (id === MAIN_ID) return MAIN_ID;
  if (doc.sources.some((s) => s.id === id)) return inputNodeId(id);
  if (doc.outputs.some((o) => o.id === id)) return outputNodeId(id);
  return null;
}

/** The main preview's rows, front (port 0) first. */
export function portRows(doc: ProjectDoc): PortRow[] {
  const wired = new Set(doc.edges.filter((e) => e.kind === 'layer' && e.to === MAIN_ID).map((e) => e.from));
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  return mainComposition(doc).layers.flatMap((id, port) => {
    const s = byId.get(id);
    return s ? [{ port, sourceId: s.id, label: s.label, visible: s.visible, connected: wired.has(s.id) }] : [];
  });
}

// Nodes are never removed with the Delete key (inputs have a delete button with a confirm).
export function docToNodes(doc: ProjectDoc): BoardNode[] {
  const connected = new Set(doc.edges.filter((e) => e.kind === 'composition').map((e) => e.to));
  const main = mainComposition(doc);
  return [
    ...doc.sources.map(
      (source): InputFlowNode => ({
        id: inputNodeId(source.id),
        type: 'inputNode',
        position: source.board,
        data: { source },
        deletable: false,
      }),
    ),
    {
      id: MAIN_ID,
      type: 'mainNode',
      position: main.board,
      data: {
        size: main.size,
        ports: portRows(doc),
        inputs: doc.sources.length,
        outputs: doc.outputs.length,
        scene: masterScene(doc),
        sources: doc.sources,
      },
      deletable: false,
    },
    ...doc.outputs.map(
      (output): OutputFlowNode => ({
        id: outputNodeId(output.id),
        type: 'outputNode',
        position: output.board,
        data: { output, connected: connected.has(output.id) },
        deletable: false,
      }),
    ),
  ];
}

/** Layer edges into main land on their row's handle; deleting one disconnects the input, deleting main→output freezes the output (T4.9). */
export function docToEdges(doc: ProjectDoc): Edge[] {
  const rows = mainComposition(doc).layers;
  return doc.edges.flatMap((e: DocEdge): Edge[] => {
    const source = endpoint(doc, e.from);
    const target = endpoint(doc, e.to);
    if (!source || !target) return [];
    const port = e.kind === 'layer' && e.to === MAIN_ID ? rows.indexOf(e.from) : -1;
    return [
      {
        id: e.id,
        source,
        target,
        ...(port >= 0 ? { targetHandle: portHandleId(port) } : {}),
        ...(e.kind === 'composition' ? { sourceHandle: OUTPUT_HANDLE } : {}),
        deletable: true,
      },
    ];
  });
}

/** Input → main preview connections (wire onto a port). */
export function isInputToMain(c: { source: string | null; target: string | null }): boolean {
  return !!c.source?.startsWith('src:') && c.target === MAIN_ID;
}

/** Main → output connections (reconnecting a disconnected output). */
export function isMainToOutput(c: { source: string | null; target: string | null }): boolean {
  return c.source === MAIN_ID && !!c.target?.startsWith('out:');
}

export const outputIdOfNode = (nodeId: string) => (nodeId.startsWith('out:') ? nodeId.slice(4) : undefined);

export const sourceIdOfNode = (nodeId: string) => (nodeId.startsWith('src:') ? nodeId.slice(4) : undefined);

/** Returns a new doc with the given node positions written into `board`; unknown ids are ignored. */
export function withPositions(doc: ProjectDoc, moved: { id: string; position: { x: number; y: number } }[]): ProjectDoc {
  if (moved.length === 0) return doc;
  const at = new Map(moved.map((m) => [m.id, { x: Math.round(m.position.x), y: Math.round(m.position.y) }]));
  const place = <T extends { board: { x: number; y: number } }>(item: T, nodeId: string): T => {
    const board = at.get(nodeId);
    return board ? { ...item, board } : item;
  };
  return {
    ...withComposition(doc, MAIN_ID, (c) => place(c, MAIN_ID)),
    sources: doc.sources.map((s) => place(s, inputNodeId(s.id))),
    outputs: doc.outputs.map((o) => place(o, outputNodeId(o.id))),
  };
}

/**
 * Fresh nodes from the doc, keeping what React Flow owns on the current ones
 * (position while dragging, selection, measured size). `positionsFromDoc` (undo/redo) takes the
 * positions from the doc instead.
 */
export function syncNodes(current: BoardNode[], fresh: BoardNode[], positionsFromDoc = false): BoardNode[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  return fresh.map((n) => {
    const prev = byId.get(n.id);
    if (!prev) return n;
    // T7.4: an unchanged node keeps its object, so React Flow doesn't re-render it on every edit.
    if (!positionsFromDoc && sameData(prev.data, n.data)) return prev;
    return { ...n, position: positionsFromDoc ? n.position : prev.position, selected: prev.selected, dragging: prev.dragging, measured: prev.measured } as BoardNode;
  });
}

/** Node data equal by value identity of each field (docs are immutable: unchanged parts keep identity). */
function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

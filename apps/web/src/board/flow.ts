/**
 * ProjectDoc ↔ React Flow. The doc is the source of truth: node positions live in `board`
 * on each source / composition / output; wires come from the doc's typed `edges` (D32).
 * Every composition is a "main preview" node (T12.3): 'main' keeps the node id `main`, others are `comp:<id>`.
 */
import { compositionById, connectRefusal, isOutputConnected, masterScene, MAIN, outputComposition, wiredLayers, wiredOutputLayers, type Composition, type Edge as DocEdge, type EdgeKind, type InputSource, type OutputNode, type ProjectDoc, type RenderScene, type Size } from '@smart-canvas/core';
import type { Edge, Node } from '@xyflow/react';

export const MAIN_ID = MAIN;
export const inputNodeId = (sourceId: string) => `src:${sourceId}`;
export const outputNodeId = (outputId: string) => `out:${outputId}`;
export const compositionNodeId = (compositionId: string) => (compositionId === MAIN ? MAIN_ID : `comp:${compositionId}`);
export const compositionIdOfNode = (nodeId: string | null | undefined): string | undefined =>
  nodeId === MAIN_ID ? MAIN : nodeId?.startsWith('comp:') ? nodeId.slice(5) : undefined;

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
    compositionId: string;
    label: string;
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
/** `layers`: the output's own rows (T12.4), front first. */
export type OutputFlowNode = Node<{ output: OutputNode; connected: boolean; layers: PortRow[] }, 'outputNode'>;
export type BoardNode = InputFlowNode | MainFlowNode | OutputFlowNode;

/** An edge's `from`/`to` are source, composition or output ids; map them to node ids (null: not on this board). */
function endpoint(doc: ProjectDoc, id: string): string | null {
  if (compositionById(doc, id)) return compositionNodeId(id);
  if (doc.sources.some((s) => s.id === id)) return inputNodeId(id);
  if (doc.outputs.some((o) => o.id === id)) return outputNodeId(id);
  return null;
}

/** A composition's rows (default: the main preview), front (port 0) first. */
export function portRows(doc: ProjectDoc, compositionId: string = MAIN): PortRow[] {
  const wired = new Set(doc.edges.filter((e) => e.kind === 'layer' && e.to === compositionId).map((e) => e.from));
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  return (compositionById(doc, compositionId)?.layers ?? []).flatMap((id, port) => {
    const s = byId.get(id);
    return s ? [{ port, sourceId: s.id, label: s.label, visible: s.visible, connected: wired.has(s.id) }] : [];
  });
}

/** An output's own rows (output-only layers, T12.4), front first. */
export function outputRows(doc: ProjectDoc, outputId: string): PortRow[] {
  const wired = wiredOutputLayers(doc, outputId);
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  return (doc.outputs.find((o) => o.id === outputId)?.layers ?? []).flatMap((id, port) => {
    const s = byId.get(id);
    return s ? [{ port, sourceId: s.id, label: s.label, visible: s.visible, connected: wired.has(s.id) }] : [];
  });
}

// Nodes are never removed with the Delete key (inputs have a delete button with a confirm).
export function docToNodes(doc: ProjectDoc): BoardNode[] {
  const connected = new Set(doc.edges.filter((e) => e.kind === 'composition').map((e) => e.to));
  const compositionNode = (c: Composition): MainFlowNode => ({
    id: compositionNodeId(c.id),
    type: 'mainNode',
    position: c.board,
    data: {
      compositionId: c.id,
      label: c.label,
      size: c.size,
      ports: portRows(doc, c.id),
      inputs: doc.sources.length,
      outputs: doc.outputs.filter((o) => outputComposition(doc, o.id) === c.id).length,
      scene: masterScene(doc, c.id),
      sources: doc.sources,
    },
    deletable: false,
  });
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
    ...doc.compositions.map(compositionNode),
    ...doc.outputs.map(
      (output): OutputFlowNode => ({
        id: outputNodeId(output.id),
        type: 'outputNode',
        position: output.board,
        data: { output, connected: connected.has(output.id), layers: outputRows(doc, output.id) },
        deletable: false,
      }),
    ),
  ];
}

/** Layer edges land on their row's handle; deleting one disconnects the input, deleting composition→output freezes the output (T4.9). */
export function docToEdges(doc: ProjectDoc): Edge[] {
  return doc.edges.flatMap((e: DocEdge): Edge[] => {
    const source = endpoint(doc, e.from);
    const target = endpoint(doc, e.to);
    if (!source || !target) return [];
    const rows = e.kind === 'layer' ? (compositionById(doc, e.to)?.layers ?? doc.outputs.find((o) => o.id === e.to)?.layers) : undefined;
    const port = rows ? rows.indexOf(e.from) : -1;
    return [
      {
        id: e.id,
        source,
        target,
        ...(port >= 0 ? { targetHandle: portHandleId(port) } : {}),
        ...(e.kind === 'composition' ? { sourceHandle: OUTPUT_HANDLE } : {}),
        className: `sc-edge--${e.kind}`,
        deletable: true,
      },
    ];
  });
}

/** A board connection as a typed graph edge (D32): node ids → doc ids; out of a composition = 'composition'. */
export function edgeOfConnection(c: { source: string | null; target: string | null }): { from: string; to: string; kind: EdgeKind } | null {
  const id = (n: string | null) => (n ? (compositionIdOfNode(n) ?? sourceIdOfNode(n) ?? outputIdOfNode(n) ?? null) : null);
  const from = id(c.source);
  const to = id(c.target);
  if (!from || !to) return null;
  return { from, to, kind: compositionIdOfNode(c.source) ? 'composition' : 'layer' };
}

/**
 * Why a wire may not go there (null = it may): port types and loops (core), one composition per output, and on
 * an output the right port (T12.4: layer rows vs the main preview port). Without `targetHandle` the port isn't checked.
 */
export function connectionRefusal(doc: ProjectDoc, c: { source: string | null; target: string | null; targetHandle?: string | null }): string | null {
  const e = edgeOfConnection(c);
  if (!e) return 'Drop the wire on a port.';
  const refusal = connectRefusal(doc, e.from, e.to, e.kind);
  if (refusal === 'wrong_type')
    return e.kind === 'composition' ? 'A main preview wires into an output.' : 'An input wires into a row of a main preview.';
  if (refusal === 'cycle') return 'That would make a loop.';
  if (refusal) return 'Drop the wire on a port.';
  const toOutput = doc.outputs.some((o) => o.id === e.to);
  if (toOutput && 'targetHandle' in c) {
    const onRow = portFromHandle(c.targetHandle) !== undefined;
    if (e.kind === 'layer' && !onRow) return 'An input wires into a layer row of an output.';
    if (e.kind === 'composition' && onRow) return 'A main preview wires into the output’s main preview port.';
  }
  if (e.kind === 'layer' && toOutput) {
    const comp = outputComposition(doc, e.to);
    if (comp && wiredLayers(doc, comp).has(e.from)) return 'This input is already a layer of the output’s main preview.';
  }
  if (e.kind === 'composition' && isOutputConnected(doc, e.to)) return 'This output already has a main preview: drag its wire off first.';
  return null;
}

/** Input → composition connections (wire onto a row); the composition id, if so. */
export function inputToComposition(c: { source: string | null; target: string | null }): string | undefined {
  return c.source?.startsWith('src:') ? compositionIdOfNode(c.target) : undefined;
}

/** Input → output connections (an output-only layer, T12.4); the output id, if so. */
export function inputToOutput(c: { source: string | null; target: string | null }): string | undefined {
  return c.source?.startsWith('src:') && c.target?.startsWith('out:') ? c.target.slice(4) : undefined;
}

/** Composition → output connections (reconnecting a disconnected output); the composition id, if so. */
export function compositionToOutput(c: { source: string | null; target: string | null }): string | undefined {
  return c.target?.startsWith('out:') ? compositionIdOfNode(c.source) : undefined;
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
    ...doc,
    compositions: doc.compositions.map((c) => place(c, compositionNodeId(c.id))),
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

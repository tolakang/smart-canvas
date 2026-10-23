/**
 * ProjectDoc ↔ React Flow. The doc is the source of truth: node positions live in `board`
 * on each source / composition / output; wires come from the doc's typed `edges` (D32).
 * D49: the master ('main') is the Layer Comp group, node id `main`.
 */
import { stackKind, assetStacks, compositionById, languagePairs, pairInputs, pairRows, presetSets, type LanguagePair, type PresetSet, connectRefusal, type AssetStack, type BoardGroup, isOutputConnected, MAIN, outputComposition, wiredLayers, type Composition, type Edge as DocEdge, type EdgeKind, type InputSource, type OutputNode, type ProjectDoc } from '@smart-canvas/core';
import type { Edge, Node } from '@xyflow/react';

export const MAIN_ID = MAIN;
export const inputNodeId = (sourceId: string) => `src:${sourceId}`;
export const outputNodeId = (outputId: string) => `out:${outputId}`;
/** D40: an Assets card. */
export const stackNodeId = (stackId: string) => `stk:${stackId}`;
export const stackIdOfNode = (nodeId: string | null | undefined) => (nodeId?.startsWith('stk:') ? nodeId.slice(4) : undefined);
/** D46: a Preset node (many output sizes); its rows' handles are `row:<outputId>`. */
export const setNodeId = (setId: string) => `set:${setId}`;
export const setIdOfNode = (nodeId: string | null | undefined) => (nodeId?.startsWith('set:') ? nodeId.slice(4) : undefined);
export const setRowHandle = (outputId: string) => `row:${outputId}`;
export const outputOfSetRow = (handle: string | null | undefined) => (handle?.startsWith('row:') ? handle.slice(4) : undefined);
/** The edge drawn from a master preview into a Preset node (stands for its sizes' wires). */
export const setInEdgeId = (setId: string) => `setin:${setId}`;
/** D44: a Headline card (Khmer / English). */
export const pairNodeId = (pairId: string) => `hl:${pairId}`;
export const pairIdOfNode = (nodeId: string | null | undefined) => (nodeId?.startsWith('hl:') ? nodeId.slice(3) : undefined);
/** A card that draws inputs (an Assets card or a Headline card): wires from it are its inputs' wires. */
export const isCardNode = (nodeId: string | null | undefined) => !!(stackIdOfNode(nodeId) ?? pairIdOfNode(nodeId));
export const compositionNodeId = (compositionId: string) => (compositionId === MAIN ? MAIN_ID : `comp:${compositionId}`);
export const compositionIdOfNode = (nodeId: string | null | undefined): string | undefined =>
  nodeId === MAIN_ID ? MAIN : nodeId?.startsWith('comp:') ? nodeId.slice(5) : undefined;

// Not 'input'/'output': React Flow has built-in node types (and CSS) under those names.
export type InputFlowNode = Node<{ source: InputSource }, 'inputNode'>;
/** D40: an Assets card and its pictures (inputs drawn inside it), in card order. */
export type StackFlowNode = Node<{ stack: AssetStack; items: InputSource[] }, 'assetsNode' | 'textNode'>;
/** D46: a Preset node and its rows (sizes, in order), each with whether it is wired. */
export type SetFlowNode = Node<{ set: PresetSet; rows: { output: OutputNode; connected: boolean }[] }, 'presetNode'>;
/** D44: a Headline card and its two inputs. */
export type PairFlowNode = Node<{ pair: LanguagePair; rows: { km: InputSource | undefined; en: InputSource | undefined }[] }, 'headlineNode'>;
/** D49: the Layer Comp + Core Rule group (the master); what it shows is read from the doc. */
export type MainFlowNode = Node<{ compositionId: string }, 'mainNode'>;

export const OUTPUT_HANDLE = 'out';
/** A composition's second out port (T12.8): itself as a layer of another composition or an output. */
export const LAYER_OUT_HANDLE = 'layer';
export function portFromHandle(handle: string | null | undefined): number | undefined {
  const m = handle ? /^p(\d+)$/.exec(handle) : null;
  return m?.[1] === undefined ? undefined : Number(m[1]);
}
export type OutputFlowNode = Node<{ output: OutputNode; connected: boolean }, 'outputNode'>;
/** A board group's frame (T13.7): derived from its members every render, never stored. */
export type GroupFlowNode = Node<{ group: BoardGroup; outputs: string[] }, 'groupNode'>;
export type BoardNode = InputFlowNode | StackFlowNode | PairFlowNode | SetFlowNode | MainFlowNode | OutputFlowNode;
/** What React Flow draws: the nodes plus group frames. */
export type FlowNode = BoardNode | GroupFlowNode;
export const groupNodeId = (groupId: string) => `grp:${groupId}`;
export const groupIdOfNode = (nodeId: string) => (nodeId.startsWith('grp:') ? nodeId.slice(4) : undefined);

/** The doc id a board node stands for (input, asset or Headline node, Preset node, the master, Preview). */
export const docIdOfNode = (nodeId: string) => sourceIdOfNode(nodeId) ?? stackIdOfNode(nodeId) ?? pairIdOfNode(nodeId) ?? setIdOfNode(nodeId) ?? compositionIdOfNode(nodeId) ?? outputIdOfNode(nodeId);

const GROUP_PAD = 24;
const GROUP_HEAD = 40;
const COLLAPSED = { w: 260, h: 48 };

/**
 * Group frames around their members (T13.7), drawn behind every node. The frame wraps the members' boxes
 * (measured sizes; a guess until measured) plus a header; a collapsed group hides its members and shrinks to
 * its header where the frame's corner was. `selected`: frames the user has selected.
 */
export function withGroupFrames(nodes: BoardNode[], groups: readonly BoardGroup[], doc: ProjectDoc, selected: ReadonlySet<string> = new Set()): (BoardNode | GroupFlowNode)[] {
  if (groups.length === 0) return nodes;
  const groupOf = new Map<string, BoardGroup>();
  for (const g of groups) for (const id of g.nodes) groupOf.set(id, g);
  const frames: GroupFlowNode[] = [];
  for (const g of groups) {
    const members = nodes.filter((n) => groupOf.get(docIdOfNode(n.id) ?? '') === g);
    if (members.length === 0) continue;
    const x0 = Math.min(...members.map((n) => n.position.x)) - GROUP_PAD;
    const y0 = Math.min(...members.map((n) => n.position.y)) - GROUP_PAD - GROUP_HEAD;
    const x1 = Math.max(...members.map((n) => n.position.x + (n.measured?.width ?? 240))) + GROUP_PAD;
    const y1 = Math.max(...members.map((n) => n.position.y + (n.measured?.height ?? 200))) + GROUP_PAD;
    const size = g.collapsed ? COLLAPSED : { w: x1 - x0, h: y1 - y0 };
    frames.push({
      id: groupNodeId(g.id),
      type: 'groupNode',
      position: { x: x0, y: y0 },
      width: size.w,
      height: size.h,
      style: { width: size.w, height: size.h },
      zIndex: -1,
      selected: selected.has(groupNodeId(g.id)),
      deletable: false,
      dragHandle: '.sc-group__head',
      data: { group: g, outputs: doc.outputs.filter((o) => g.nodes.includes(o.id)).map((o) => o.id) },
    });
  }
  const collapsed = new Set(groups.filter((g) => g.collapsed).flatMap((g) => g.nodes));
  return [...frames, ...nodes.map((n) => (collapsed.has(docIdOfNode(n.id) ?? '') ? ({ ...n, hidden: true } as BoardNode) : n))];
}

/** An edge's `from`/`to` are source, composition or output ids; map them to node ids (null: not on this board). */
function endpoint(doc: ProjectDoc, id: string): string | null {
  if (compositionById(doc, id)) return compositionNodeId(id);
  if (doc.sources.some((s) => s.id === id)) {
    // D40: a picture in an Assets card is drawn by the card, so are its wires.
    const st = assetStacks(doc).find((x) => x.items.includes(id));
    if (st) return stackNodeId(st.id);
    const pair = languagePairs(doc).find((p) => pairInputs(p).includes(id));
    return pair ? pairNodeId(pair.id) : inputNodeId(id);
  }
  if (doc.outputs.some((o) => o.id === id)) return outputNodeId(id);
  return null;
}

// Nodes are never removed with the Delete key (inputs have a delete button with a confirm).
export function docToNodes(doc: ProjectDoc): BoardNode[] {
  const connected = new Set(doc.edges.filter((e) => e.kind === 'composition').map((e) => e.to));
  const hiddenPreviews = new Set(presetSets(doc).flatMap((set) => (set.hidden ?? []).filter((o) => set.outputs.includes(o))));
  const compositionNode = (c: Composition): MainFlowNode => ({
    id: compositionNodeId(c.id),
    type: 'mainNode',
    position: c.board,
    data: { compositionId: c.id },
    deletable: false,
  });
  const stacks = assetStacks(doc);
  const pairs = languagePairs(doc);
  const inStack = new Set([...stacks.flatMap((st) => st.items), ...pairs.flatMap(pairInputs)]);
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  return [
    ...stacks.map(
      (stack): StackFlowNode => ({
        id: stackNodeId(stack.id),
        // D49: a Text node's slots are typed into on the card; Image and Logo nodes hold pictures.
        type: stackKind(stack) === 'text' ? 'textNode' : 'assetsNode',
        position: stack.board,
        data: { stack, items: stack.items.flatMap((id) => byId.get(id) ?? []) },
        deletable: false,
      }),
    ),
    ...pairs.map(
      (pair): PairFlowNode => ({
        id: pairNodeId(pair.id),
        type: 'headlineNode',
        position: pair.board,
        data: { pair, rows: pairRows(pair).map((r) => ({ km: byId.get(r.km), en: byId.get(r.en) })) },
        deletable: false,
      }),
    ),
    ...doc.sources.filter((s) => !inStack.has(s.id)).map(
      (source): InputFlowNode => ({
        id: inputNodeId(source.id),
        type: 'inputNode',
        position: source.board,
        data: { source },
        deletable: false,
      }),
    ),
    // D49 (page 3): one Layer Comp — the master; its square / vertical / horizontal layouts open from it.
    ...doc.compositions.filter((c) => c.id === MAIN).map(compositionNode),
    ...presetSets(doc).map(
      (set): SetFlowNode => ({
        id: setNodeId(set.id),
        type: 'presetNode',
        position: set.board,
        data: { set, rows: set.outputs.flatMap((id) => doc.outputs.find((o) => o.id === id) ?? []).map((output) => ({ output, connected: connected.has(output.id) })) },
        deletable: false,
      }),
    ),
    ...doc.outputs.map(
      (output): OutputFlowNode => ({
        // D51: a Preview hidden from its Preset node's row is off the board (and so are its wires).
        ...(hiddenPreviews.has(output.id) ? { hidden: true } : {}),
        id: outputNodeId(output.id),
        type: 'outputNode',
        position: output.board,
        data: { output, connected: connected.has(output.id) },
        deletable: false,
      }),
    ),
  ];
}

/** Layer edges land on their row's handle; deleting one disconnects the input, deleting composition→output freezes the output (T4.9). */
export function docToEdges(doc: ProjectDoc): Edge[] {
  // D46: a Preset node's sizes are fed by one wire into the node, then one wire from each row to its Preview.
  const setOfOutput = new Map(presetSets(doc).flatMap((set) => set.outputs.map((o) => [o, set] as const)));
  const setIn = new Map<string, Edge>();
  const drawn = new Set<string>();
  return doc.edges.flatMap((e: DocEdge): Edge[] => {
    const set = e.kind === 'composition' ? setOfOutput.get(e.to) : undefined;
    if (set) {
      const fromNode = endpoint(doc, e.from);
      if (!fromNode) return [];
      // D51: a row's wire has no ✂ badge (the row's eye hides its Preview; select the wire to cut it).
      const row: Edge = { id: e.id, type: 'routed', data: { points: [], noCut: true }, source: setNodeId(set.id), sourceHandle: setRowHandle(e.to), target: outputNodeId(e.to), className: 'sc-edge--composition', deletable: true };
      if (setIn.has(set.id)) return [row];
      const into: Edge = { id: setInEdgeId(set.id), type: 'routed', data: { points: [] }, source: fromNode, sourceHandle: OUTPUT_HANDLE, target: setNodeId(set.id), className: 'sc-edge--composition', deletable: true };
      setIn.set(set.id, into);
      return [into, row];
    }
    // D49: only asset nodes → the Layer Comp (one wire per asset node, into its top), the Layer Comp → Preset
    // nodes → Previews are drawn; the master's layouts and an output's own layers are not on the board.
    if (e.kind !== 'layer' || e.to !== MAIN) return [];
    const source = endpoint(doc, e.from);
    if (!source) return [];
    const card = isCardNode(source);
    if (card && drawn.has(source)) return [];
    drawn.add(source);
    return [
      {
        id: card ? cardEdgeId(source) : e.id,
        type: 'routed',
        data: { points: card ? [] : (e.points ?? []) },
        source,
        target: MAIN_ID,
        targetHandle: LAYERS_HANDLE,
        className: 'sc-edge--layer',
        deletable: true,
      },
    ];
  });
}

/** D49: the Layer Comp's one layer port (top): every asset node wires in there. */
export const LAYERS_HANDLE = 'layers';
/** D49: the one wire drawn from a card (Image, Headline) into the Layer Comp; it stands for all its pictures' wires. */
export const cardEdgeId = (cardNodeId: string) => `card:${cardNodeId}`;

type Conn = { source: string | null; target: string | null; sourceHandle?: string | null };

/** The layer a connection carries (an input, or a composition out of its layer port, T12.8). */
export function layerOfConnection(c: Conn): string | undefined {
  if (!c.source) return undefined;
  return c.sourceHandle === LAYER_OUT_HANDLE ? compositionIdOfNode(c.source) : sourceIdOfNode(c.source);
}

/** A board connection as a typed graph edge (D32): node ids → doc ids; out of a composition's main port = 'composition'. */
export function edgeOfConnection(c: Conn): { from: string; to: string; kind: EdgeKind } | null {
  const id = (n: string | null) => (n ? (compositionIdOfNode(n) ?? sourceIdOfNode(n) ?? outputIdOfNode(n) ?? null) : null);
  const from = id(c.source);
  const to = id(c.target);
  if (!from || !to) return null;
  return { from, to, kind: compositionIdOfNode(c.source) && c.sourceHandle !== LAYER_OUT_HANDLE ? 'composition' : 'layer' };
}

/**
 * Why a wire may not go there (null = it may): port types and loops (core), one composition per output, and on
 * an output the right port (T12.4: layer rows vs the master preview port). Without `targetHandle` the port isn't checked.
 */
export function connectionRefusal(doc: ProjectDoc, c: Conn & { targetHandle?: string | null }): string | null {
  if (isCardNode(c.source)) return compositionIdOfNode(c.target) ? null : 'An asset node wires into the Layer Comp.';
  // D46 / D49: the Layer Comp group wires into a Preset node; a Preset node's row wires into its own Preview.
  if (setIdOfNode(c.target)) return compositionIdOfNode(c.source) && c.sourceHandle !== LAYER_OUT_HANDLE ? null : 'Only the Layer Comp group wires into a Preset node.';
  if (setIdOfNode(c.source)) return outputOfSetRow(c.sourceHandle) && c.target === outputNodeId(outputOfSetRow(c.sourceHandle) ?? '') ? null : 'A size row wires into its own preview.';
  const e = edgeOfConnection(c);
  if (!e) return 'Drop the wire on a port.';
  const refusal = connectRefusal(doc, e.from, e.to, e.kind);
  if (refusal === 'wrong_type')
    return e.kind === 'composition' ? 'A master preview wires into an output.' : compositionById(doc, e.from) ? 'A master preview goes into a row of another master preview or an output.' : 'An input wires into a row of a master preview.';
  if (refusal === 'cycle') return 'That would make a loop.';
  if (refusal) return 'Drop the wire on a port.';
  const toOutput = doc.outputs.some((o) => o.id === e.to);
  if (toOutput && 'targetHandle' in c) {
    const onRow = portFromHandle(c.targetHandle) !== undefined;
    if (e.kind === 'layer' && !onRow) return 'An input wires into a layer row of an output.';
    if (e.kind === 'composition' && onRow) return 'A master preview wires into the output’s master preview port.';
  }
  if (e.kind === 'layer' && toOutput) {
    const comp = outputComposition(doc, e.to);
    if (comp && wiredLayers(doc, comp).has(e.from)) return 'This input is already a layer of the output’s master preview.';
  }
  if (e.kind === 'composition' && isOutputConnected(doc, e.to)) return 'This output already has a master preview: drag its wire off first.';
  return null;
}

/** Input → composition connections (wire onto a row); the composition id, if so. */
export function inputToComposition(c: Conn): string | undefined {
  return layerOfConnection(c) ? compositionIdOfNode(c.target) : undefined;
}

/** Input → output connections (an output-only layer, T12.4); the output id, if so. */
export function inputToOutput(c: Conn): string | undefined {
  return layerOfConnection(c) && c.target?.startsWith('out:') ? c.target.slice(4) : undefined;
}

/** Composition → output connections (reconnecting a disconnected output); the composition id, if so. */
export function compositionToOutput(c: Conn): string | undefined {
  return c.target?.startsWith('out:') && c.sourceHandle !== LAYER_OUT_HANDLE ? compositionIdOfNode(c.source) : undefined;
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
    ...(doc.stacks ? { stacks: doc.stacks.map((st) => place(st, stackNodeId(st.id))) } : {}),
    ...(doc.headlines ? { headlines: doc.headlines.map((p) => place(p, pairNodeId(p.id))) } : {}),
    ...(doc.presetSets ? { presetSets: doc.presetSets.map((s) => place(s, setNodeId(s.id))) } : {}),
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
    if (!positionsFromDoc && sameData(prev.data, n.data) && prev.hidden === n.hidden) return prev;
    // `hidden` (D51) comes from the doc like the data.
    return { ...n, position: positionsFromDoc ? n.position : prev.position, selected: prev.selected, dragging: prev.dragging, measured: prev.measured } as BoardNode;
  });
}

/** Node data equal by value identity of each field (docs are immutable: unchanged parts keep identity). */
function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

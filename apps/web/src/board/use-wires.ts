/**
 * The board's wire handlers (clean-up 2, U8: moved out of Board.tsx as they were): connecting, reconnecting by
 * either end, deleting, a wire dropped on empty canvas, and reroute points.
 */
import {
  assetStacks,
  connectSet,
  connectSource,
  connectStack,
  disconnectSource,
  languagePairs,
  pairInputs,
  presetSets,
  setComposition,
  setEdgePoints,
  setEmptyCardWired,
  type ProjectDoc,
  type SourceResult,
} from '@smart-canvas/core';
import { applyEdgeChanges, type Connection, type Edge, type EdgeChange, type FinalConnectionState, type HandleType, type IsValidConnection, type ReactFlowInstance } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import {
  compositionIdOfNode,
  compositionToOutput,
  connectionRefusal,
  inputToComposition,
  isCardNode,
  layerOfConnection,
  MAIN_ID,
  OUTPUT_HANDLE,
  outputIdOfNode,
  outputOfSetRow,
  pairIdOfNode,
  portFromHandle,
  setIdOfNode,
  stackIdOfNode,
  type FlowNode,
} from './flow';
import { insertIndex } from './wires';

/** A layer wire into a composition row (D56: the only kind); the node id from React Flow. */
function connectLayer(doc: ProjectDoc, sourceId: string, target: string | null, port: number | undefined): SourceResult {
  const composition = compositionIdOfNode(target);
  return composition ? connectSource(doc, sourceId, port, composition) : { ok: false, error: 'not_found' };
}

function disconnectLayer(doc: ProjectDoc, sourceId: string, target: string): SourceResult {
  const composition = compositionIdOfNode(target);
  return composition ? disconnectSource(doc, sourceId, composition) : { ok: false, error: 'not_found' };
}

export interface WireDeps {
  readOnly: boolean;
  docRef: React.MutableRefObject<ProjectDoc>;
  flow: React.MutableRefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  run: (op: (doc: ProjectDoc) => SourceResult) => SourceResult;
  /** Wires an output to a composition, asking first when it has overrides (D21). */
  reconnect: (outputId: string, compositionId?: string) => void;
  disconnect: (outputId: string) => void;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setNotice: (notice: string | null) => void;
  /** D49: the Preset nodes menu, where a wire from the Main Comps group was dropped. */
  openPresets: (client: { x: number; y: number }) => void;
}

export function useWires({ readOnly, docRef, flow, run, reconnect, disconnect, setEdges, setNotice, openPresets }: WireDeps) {
  // T12.2: typed ports (D32). The core decides what may connect; a refused drop says why.
  const isValidConnection = useCallback<IsValidConnection>((c) => !readOnly && connectionRefusal(docRef.current, c) === null, [readOnly, docRef]);

  /** Wire input → a composition row: connects it there, and moves it to that row if different (D11). */
  const onConnect = useCallback(
    (c: Connection) => {
      const fromComposition = compositionToOutput(c);
      const outputId = fromComposition ? outputIdOfNode(c.target) : undefined;
      if (fromComposition && outputId) {
        reconnect(outputId, fromComposition);
        return;
      }
      // D46: a master preview wired into a Preset node feeds every size; a row's wire reconnects its own Preview.
      const intoSet = setIdOfNode(c.target);
      const fromComp = compositionIdOfNode(c.source);
      if (intoSet && fromComp) {
        run((doc) => connectSet(doc, intoSet, fromComp));
        return;
      }
      const fromSet = setIdOfNode(c.source);
      const rowOutput = outputOfSetRow(c.sourceHandle);
      if (fromSet && rowOutput) {
        reconnect(rowOutput, setComposition(docRef.current, fromSet));
        return;
      }
      // D40: a wire from an Assets card wires every picture in it.
      const stackId = stackIdOfNode(c.source);
      const toComposition = compositionIdOfNode(c.target);
      if (stackId && toComposition) {
        run((doc) => connectStack(doc, stackId, toComposition));
        return;
      }
      // D44, N3: a wire from a Headline card wires both languages of every pair.
      const pair = languagePairs(docRef.current).find((p) => p.id === pairIdOfNode(c.source));
      if (pair && toComposition) {
        run((doc) => {
          let next = doc;
          for (const id of pairInputs(pair)) {
            const r = connectSource(next, id, undefined, toComposition);
            if (!r.ok) return r;
            next = r.doc;
          }
          return { ok: true, doc: next };
        });
        return;
      }
      const sourceId = layerOfConnection(c);
      if (sourceId) run((doc) => connectLayer(doc, sourceId, c.target, portFromHandle(c.targetHandle)));
    },
    [run, reconnect, docRef],
  );

  // Edges are controlled: apply selection here; removals go through the doc (onEdgesDelete).
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const selection = changes.filter((c) => c.type === 'select');
      if (selection.length) setEdges((es) => applyEdgeChanges(selection, es));
    },
    [setEdges],
  );

  /** T13.8: double-click a wire to add a reroute point there (in the spot that bends it least). */
  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (readOnly || !flow.current) return;
      const at = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const end = (id: string, side: 'out' | 'in') => {
        const n = flow.current?.getInternalNode(id);
        const w = n?.measured.width ?? 0;
        const h = n?.measured.height ?? 0;
        const p = n?.internals.positionAbsolute ?? { x: 0, y: 0 };
        return { x: side === 'out' ? p.x + w : p.x, y: p.y + h / 2 };
      };
      const points = docRef.current.edges.find((x) => x.id === edge.id)?.points ?? [];
      const i = insertIndex(end(edge.source, 'out'), end(edge.target, 'in'), points, at);
      run((doc) => setEdgePoints(doc, edge.id, [...points.slice(0, i), at, ...points.slice(i)]));
    },
    [readOnly, run, flow, docRef],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        // D46: the wire into a Preset node stands for all its sizes' wires; a row's wire is that size's own.
        const set = setIdOfNode(e.target);
        if (set) {
          for (const o of presetSets(docRef.current).find((x) => x.id === set)?.outputs ?? []) if (docRef.current.edges.some((x) => x.kind === 'composition' && x.to === o)) disconnect(o);
          continue;
        }
        const row = setIdOfNode(e.source) ? outputOfSetRow(e.sourceHandle) : undefined;
        if (row) {
          disconnect(row);
          continue;
        }
        // D49: a card's one wire into Main Comps stands for all its items' wires.
        if (e.id.startsWith('card:')) {
          const d0 = docRef.current;
          const stack = assetStacks(d0).find((st) => st.id === stackIdOfNode(e.source));
          const pair = languagePairs(d0).find((p) => p.id === pairIdOfNode(e.source));
          const items = stack?.items ?? (pair ? pairInputs(pair) : []);
          // D49.1: an empty card's wire is the card's own.
          if (stack && !stack.items.length) {
            run((doc) => setEmptyCardWired(doc, stack.id, false));
            continue;
          }
          run((doc) => {
            let next = doc;
            for (const id of items) {
              const r = disconnectSource(next, id, MAIN_ID);
              if (r.ok) next = r.doc;
            }
            return { ok: true, doc: next };
          });
          continue;
        }
        // D40: a wire drawn from an Assets card is one picture's wire.
        const sourceId = layerOfConnection(e) ?? (isCardNode(e.source) ? docRef.current.edges.find((x) => x.id === e.id)?.from : undefined);
        const outputId = compositionIdOfNode(e.source) ? outputIdOfNode(e.target) : undefined;
        if (sourceId) run((doc) => disconnectLayer(doc, sourceId, e.target));
        else if (outputId) disconnect(outputId);
      }
    },
    [run, disconnect, docRef],
  );

  /**
   * T8.5: every wire can be picked up by either end. Drop it on another valid handle to re-route it;
   * drop it on empty canvas to detach (same as deleting the wire). Dropping on a handle that refuses it
   * leaves the wire as it was.
   */
  const reconnectDone = useRef(false);
  // React Flow also ends a wire-end drag with onConnectEnd; T10.4 must not read that as a new wire.
  const wireEndDrag = useRef<{ active: boolean; endedAt: number }>({ active: false, endedAt: 0 });
  const onReconnectStart = useCallback(() => {
    reconnectDone.current = false;
    wireEndDrag.current = { active: true, endedAt: 0 };
  }, []);
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      reconnectDone.current = true;
      const oldSource = layerOfConnection(old);
      const newSource = layerOfConnection(c);
      if (oldSource && newSource && inputToComposition(c)) {
        // Same input to another row = move it to that row; another input onto this row = swap who feeds it.
        const port = portFromHandle(c.targetHandle);
        run((doc) => {
          const freed = newSource === oldSource && old.target === c.target ? { ok: true as const, doc } : disconnectLayer(doc, oldSource, old.target);
          return freed.ok ? connectLayer(freed.doc, newSource, c.target, port) : freed;
        });
        return;
      }
      const oldOutput = compositionIdOfNode(old.source) ? outputIdOfNode(old.target) : undefined;
      const fromComposition = compositionToOutput(c);
      const newOutput = fromComposition ? outputIdOfNode(c.target) : undefined;
      if (oldOutput && newOutput && fromComposition && oldOutput !== newOutput) {
        disconnect(oldOutput);
        reconnect(newOutput, fromComposition);
      }
    },
    [run, disconnect, reconnect],
  );
  const onReconnectEnd = useCallback(
    (_e: MouseEvent | TouchEvent, edge: Edge, _type: HandleType, state: FinalConnectionState) => {
      wireEndDrag.current = { active: false, endedAt: performance.now() };
      if (!reconnectDone.current && !state.toHandle) onEdgesDelete([edge]);
    },
    [onEdgesDelete],
  );

  /** A wire dropped on a port that refuses it says why; one from the Main Comps group dropped on empty canvas offers the Preset nodes (D49). */
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (readOnly || state.isValid || !flow.current) return;
      if (state.toHandle) {
        const why = connectionRefusal(docRef.current, { source: state.fromNode?.id ?? null, sourceHandle: state.fromHandle?.id ?? null, target: state.toNode?.id ?? null, targetHandle: state.toHandle?.id ?? null });
        if (why) setNotice(why);
        return;
      }
      const r = wireEndDrag.current;
      if (r.active || performance.now() - r.endedAt < 100) return;
      const from = state.fromHandle;
      const point = 'changedTouches' in e ? e.changedTouches[0] : e;
      if (!from || !point || from.nodeId !== MAIN_ID || from.id !== OUTPUT_HANDLE) return;
      openPresets({ x: point.clientX, y: point.clientY });
    },
    [readOnly, openPresets, flow, docRef, setNotice],
  );

  return { isValidConnection, onConnect, onEdgesChange, onEdgeDoubleClick, onEdgesDelete, onReconnectStart, onReconnect, onReconnectEnd, onConnectEnd };
}

import {
  addComposition,
  addSourceFromLibrary,
  addOutput,
  canAddComposition,
  addSource,
  connectSource,
  deleteSource,
  disconnectOutput,
  disconnectSource,
  duplicateSource,
  LIMITS,
  outputDefaults,
  reconnectNeedsChoice,
  reconnectOutput,
  setSourceVisible, type InputSource, type ProjectDoc, type SizePreset, type SourceError, type SourceResult } from '@smart-canvas/core';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type HandleType,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Autosave, type SaveState } from './autosave';
import { FontsDialog } from '../fonts/FontsDialog';
import { registerTeamFonts, type TeamFont } from '../fonts/loader';
import { MainEditor } from '../editor/MainEditor';
import { OutputEditor } from '../editor/OutputEditor';
import { AddInputDialog, type NewInput } from './AddInputDialog';
import { AddOutputDialog, type NewOutput } from './AddOutputDialog';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { ExportDialog } from './ExportDialog';
import { confirmDelete, Icon } from './LayerRow';
import { History } from './history';
import { LibraryDialog } from './LibraryDialog';
import { ReconnectDialog } from './ReconnectDialog';
import { useAssetSizes, useLayoutDeps } from './layout-deps';
import { BoardContext, type BoardActions } from './context';
import { newId } from './ids';
import { withSource } from './content';
import {
  docToEdges,
  docToNodes,
  compositionIdOfNode,
  compositionToOutput,
  inputToComposition,
  connectionRefusal,
  MAIN_ID,
  OUTPUT_HANDLE,
  outputIdOfNode,
  portFromHandle,
  sourceIdOfNode,
  syncNodes,
  withPositions,
  type BoardNode,
} from './flow';
import { useTheme } from '../ui/theme';
import { align } from './guides';
import { BoardKeys, useStoredFlag } from './board-keys';
import { CanvasToolbar, type CanvasTool } from './CanvasToolbar';
import { Inspector } from './Inspector';
import { COARSE_QUERY, useScreen } from '../ui/responsive';
import { useLongPress } from '../ui/long-press';
import { ADD_DRAG_TYPE, NodeLibrary, type AddSpec } from './NodeLibrary';
import { nodeTypes } from './nodes';
import { presetSettings, sizeLabel } from './OutputNode';

interface Loaded {
  rev: number;
  doc: ProjectDoc;
}
type LoadResult = { key: number } & ({ ok: Loaded } | { error: string });

const ERROR_NOTICE: Partial<Record<SourceError, string>> = {
  limit: `A project can have at most ${LIMITS.maxSources} inputs.`,
  output_limit: `A project can have at most ${LIMITS.maxOutputs} outputs.`,
  invalid: 'That value is out of range.',
};

/** T10.4: an output made by dropping a wire starts at this size (the Add output dialog's default). */
const NEW_OUTPUT_SIZE = { width: 1080, height: 1350, unit: 'px' } as const;
/** About where an output node's input handle sits below its top-left corner, so the new node lands on the pointer. */
const NEW_OUTPUT_HANDLE_Y = 26;

const STATE_LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Save failed, retrying…',
  conflict: 'Someone else saved a newer version.',
};

export function Board(props: { teamId: string; projectId: string; userId: string; readOnly: boolean; onBack: () => void }) {
  const { teamId, projectId, readOnly } = props;
  const url = `/teams/${teamId}/projects/${projectId}`;
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    let live = true;
    api<Loaded>('GET', url).then(
      (p) => live && setResult({ key: reloadKey, ok: { rev: p.rev, doc: p.doc } }),
      (e: unknown) =>
        live &&
        setResult({ key: reloadKey, error: e instanceof ApiError ? `Could not load project (${e.status})` : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [url, reloadKey]);

  // Only data fetched for the current reload counts: never remount the canvas on a stale rev.
  if (!result || result.key !== reloadKey) return <p className="sc-muted">Loading…</p>;
  if ('error' in result) return <p className="sc-error">{result.error}</p>;
  return (
    <BoardCanvas
      key={reloadKey}
      teamId={teamId}
      projectId={projectId}
      userId={props.userId}
      url={url}
      initial={result.ok}
      readOnly={readOnly}
      onBack={props.onBack}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}

function BoardCanvas(props: {
  teamId: string;
  projectId: string;
  userId: string;
  url: string;
  initial: Loaded;
  readOnly: boolean;
  onBack: () => void;
  onReload: () => void;
}) {
  const { teamId, projectId, url, initial, readOnly } = props;
  const docRef = useRef(initial.doc);
  const [doc, setDoc] = useState(initial.doc);
  /** The composition open in the main preview editor (T12.3: any composition). */
  const [editingMain, setEditingMain] = useState<string | null>(null);
  const [editingOutput, setEditingOutput] = useState<string | null>(null);
  const [nodes, setNodes] = useState<BoardNode[]>(() => docToNodes(initial.doc));
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edges, setEdges] = useState(() => docToEdges(initial.doc));
  const [sourceCount, setSourceCount] = useState(initial.doc.sources.length);
  const [adding, setAdding] = useState(false);
  const [addingOutput, setAddingOutput] = useState(false);
  /** Where a node added from the canvas menu goes (flow coordinates); null = the default column (T8.4). */
  const [theme, toggleTheme] = useTheme();
  /** T13.2: the one selected node (React Flow id), shown in the inspector. */
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [placeAt, setPlaceAt] = useState<{ x: number; y: number } | null>(null);
  const flow = useRef<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const [outputCount, setOutputCount] = useState(initial.doc.outputs.length);
  const [reconnecting, setReconnecting] = useState<{ outputId: string; compositionId: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [teamFonts, setTeamFonts] = useState<TeamFont[]>([]);
  const [fontsKey, setFontsKey] = useState(0);

  // Team fonts are registered (@font-face) as soon as the board opens, so text renders and measures in them.
  useEffect(() => {
    let live = true;
    api<TeamFont[]>('GET', `/teams/${teamId}/fonts`).then(
      (fonts) => {
        if (!live) return;
        registerTeamFonts(teamId, fonts);
        setTeamFonts(fonts);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [teamId, fontsKey]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const autosave = useMemo(
    () =>
      new Autosave({
        rev: initial.rev,
        save: (rev, doc) => api<{ rev: number }>('PUT', url, { rev, doc }),
        isConflict: (e) => e instanceof ApiError && e.status === 409,
        onState: setSaveState,
      }),
    [url, initial.rev],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosave.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void autosave.flush();
      autosave.dispose();
    };
  }, [autosave]);

  // T13.5: a dragged node snaps to other nodes' edges and centres; the guide lines show where.
  const [guides, setGuides] = useState<{ vertical?: number; horizontal?: number }>({});
  const onNodesChange = useCallback((changes: NodeChange<BoardNode>[]) => {
    const [moving] = changes;
    if (changes.length === 1 && moving?.type === 'position') {
      const ns = nodesRef.current;
      const node = ns.find((n) => n.id === moving.id);
      const size = (n: BoardNode) => ({ w: n.measured?.width ?? 0, h: n.measured?.height ?? 0 });
      if (moving.dragging && moving.position && node && size(node).w) {
        const others = ns.filter((n) => n.id !== moving.id && !n.selected && size(n).w).map((n) => ({ x: n.position.x, y: n.position.y, ...size(n) }));
        const a = align({ ...moving.position, ...size(node) }, others);
        moving.position = { x: a.x ?? moving.position.x, y: a.y ?? moving.position.y };
        setGuides({ vertical: a.vertical, horizontal: a.horizontal });
      } else if (!moving.dragging) setGuides({});
    }
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);
  // T13.6 (D33): touch screens start with the Hand tool (one finger pans, pinch zooms).
  const [tool, setTool] = useState<CanvasTool>(() => (window.matchMedia?.(COARSE_QUERY).matches ? 'hand' : 'select'));
  const screen = useScreen();
  const floating = screen === 'phone' ? 'sheet' : screen === 'tablet' ? 'overlay' : undefined;
  /** Tablet / phone: the one floating panel that is open. */
  const [panel, setPanel] = useState<'library' | 'inspector' | null>(null);
  const flowEl = useRef<HTMLDivElement>(null);
  useLongPress(flowEl);
  const [grid, setGrid] = useStoredFlag('sc-board-grid', false);
  const [minimap, setMinimap] = useStoredFlag('sc-board-minimap', true);

  // Undo / redo (T7.2): snapshots of the doc, per session.
  const history = useRef(new History<ProjectDoc>());
  const [canStep, setCanStep] = useState({ undo: false, redo: false });
  const syncHistory = useCallback(() => setCanStep({ undo: history.current.canUndo, redo: history.current.canRedo }), []);

  /** Shows `doc` everywhere and saves it; `positionsFromDoc` when node positions must follow (undo/redo). */
  const show = useCallback(
    (doc: ProjectDoc, positionsFromDoc = false) => {
      docRef.current = doc;
      setDoc(doc);
      setNodes((ns) => syncNodes(ns, docToNodes(doc), positionsFromDoc));
      setEdges(docToEdges(doc));
      setSourceCount(doc.sources.length);
      setOutputCount(doc.outputs.length);
      autosave.change(doc);
    },
    [autosave],
  );

  /** The single way the doc changes from the UI: recorded for undo, board state follows, autosave picks it up. */
  const apply = useCallback(
    (doc: ProjectDoc, key: string | null = null) => {
      if (readOnly || doc === docRef.current) return;
      history.current.record(docRef.current, key);
      syncHistory();
      show(doc);
    },
    [readOnly, show, syncHistory],
  );

  const undo = useCallback(() => {
    const prev = readOnly ? null : history.current.undo(docRef.current);
    if (!prev) return;
    syncHistory();
    show(prev, true);
  }, [readOnly, show, syncHistory]);
  const redo = useCallback(() => {
    const next = readOnly ? null : history.current.redo(docRef.current);
    if (!next) return;
    syncHistory();
    show(next, true);
  }, [readOnly, show, syncHistory]);

  // Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo — except while typing in a field (its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const run = useCallback(
    (op: (doc: ProjectDoc) => SourceResult): SourceResult => {
      const result = op(docRef.current);
      if (result.ok) {
        setNotice(null);
        apply(result.doc);
      } else {
        setNotice(ERROR_NOTICE[result.error] ?? 'That change could not be made.');
      }
      return result;
    },
    [apply],
  );

  const [presets, setPresets] = useState<SizePreset[]>([]);
  useEffect(() => {
    let live = true;
    api<SizePreset[]>('GET', `/teams/${teamId}/presets`).then(
      (list) => live && setPresets(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [teamId]);
  const { sizes, remember } = useAssetSizes(teamId);
  const { deps: layoutDeps, missingFonts } = useLayoutDeps(doc, sizes, teamFonts.map((f) => f.id).join(','));

  const disconnect = useCallback(
    (outputId: string) => {
      if (!layoutDeps) {
        setNotice('Fonts are still loading; try again in a moment.');
        return;
      }
      run((d) => disconnectOutput(d, outputId, layoutDeps));
    },
    [layoutDeps, run],
  );
  /** Wires an output to a composition (main by default): silently, or after asking when it has overrides (D21). */
  const reconnect = useCallback(
    (outputId: string, compositionId: string = MAIN_ID) => {
      if (reconnectNeedsChoice(docRef.current, outputId)) setReconnecting({ outputId, compositionId });
      else run((d) => reconnectOutput(d, outputId, 'keep', compositionId));
    },
    [run],
  );

  const { userId } = props;
  const author = useCallback(() => ({ by: userId, at: new Date().toISOString() }), [userId]);

  const actions = useMemo<BoardActions>(
    () => ({
      teamId,
      readOnly,
      doc,
      openMainEditor: (compositionId: string = MAIN_ID) => setEditingMain(compositionId),
      openOutputEditor: (id: string) => setEditingOutput(id),
      author,
      teamFonts,
      sourceCount,
      // Typing in one input's field is one undo step (coalesced by key).
      editSource: (id: string, edit: (s: InputSource) => InputSource) => apply(withSource(docRef.current, id, edit), `source:${id}`),
      layoutDeps,
      missingFonts,
      presets,
      rememberAsset: remember,
      disconnectOutput: disconnect,
      reconnectOutput: reconnect,
      run,
    }),
    [teamId, readOnly, doc, teamFonts, sourceCount, layoutDeps, missingFonts, presets, remember, disconnect, reconnect, author, apply, run],
  );

  // T12.2: typed ports (D32). The core decides what may connect; a refused drop says why.
  const isValidConnection = useCallback<IsValidConnection>((c) => !readOnly && connectionRefusal(docRef.current, c) === null, [readOnly]);

  /** Wire input → a composition row: connects it there, and moves it to that row if different (D11). */
  const onConnect = useCallback(
    (c: Connection) => {
      const fromComposition = compositionToOutput(c);
      const outputId = fromComposition ? outputIdOfNode(c.target) : undefined;
      if (fromComposition && outputId) {
        reconnect(outputId, fromComposition);
        return;
      }
      const sourceId = sourceIdOfNode(c.source);
      const into = inputToComposition(c);
      if (!sourceId || !into) return;
      run((doc) => connectSource(doc, sourceId, portFromHandle(c.targetHandle), into));
    },
    [run, reconnect],
  );

  // Edges are controlled: apply selection here; removals go through the doc (onEdgesDelete).
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selection = changes.filter((c) => c.type === 'select');
    if (selection.length) setEdges((es) => applyEdgeChanges(selection, es));
  }, []);

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        const sourceId = sourceIdOfNode(e.source);
        const into = compositionIdOfNode(e.target);
        const outputId = compositionIdOfNode(e.source) ? outputIdOfNode(e.target) : undefined;
        if (sourceId && into) run((doc) => disconnectSource(doc, sourceId, into));
        else if (outputId) disconnect(outputId);
      }
    },
    [run, disconnect],
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
      const oldSource = sourceIdOfNode(old.source);
      const oldInto = compositionIdOfNode(old.target);
      const newSource = sourceIdOfNode(c.source);
      const into = inputToComposition(c);
      if (oldSource && oldInto && newSource && into) {
        // Same input to another row = move it to that row; another input onto this row = swap who feeds it.
        const port = portFromHandle(c.targetHandle);
        run((doc) => {
          const freed = newSource === oldSource && oldInto === into ? { ok: true as const, doc } : disconnectSource(doc, oldSource, oldInto);
          return freed.ok ? connectSource(freed.doc, newSource, port, into) : freed;
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

  /**
   * T10.4: a wire dragged out of the main preview and released on empty canvas adds an output there, already
   * wired (addOutput wires main → output, D12). It starts at the default size; its preset can be changed on the node.
   */
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (readOnly || state.isValid || !flow.current) return;
      if (state.toHandle) {
        const why = connectionRefusal(docRef.current, { source: state.fromNode?.id ?? null, target: state.toNode?.id ?? null });
        if (why) setNotice(why);
        return;
      }
      const r = wireEndDrag.current;
      if (r.active || performance.now() - r.endedAt < 100) return;
      const composition = compositionIdOfNode(state.fromNode?.id);
      if (!composition || state.fromHandle?.id !== OUTPUT_HANDLE) return;
      const point = 'changedTouches' in e ? e.changedTouches[0] : e;
      if (!point) return;
      const at = flow.current.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const size = { ...NEW_OUTPUT_SIZE };
      run((doc) => addOutput(doc, { id: newId(), label: sizeLabel(size), size, ...outputDefaults('px'), composition, board: { x: at.x, y: at.y - NEW_OUTPUT_HANDLE_Y } }));
    },
    [readOnly, run],
  );

  /** Duplicates inputs (each copy right next to its original), as one undo step. */
  const duplicateInputs = useCallback(
    (ids: string[]) => {
      if (readOnly) return;
      run((doc) => {
        let next = doc;
        for (const id of ids) {
          const r = duplicateSource(next, id, newId());
          if (!r.ok) return r;
          next = r.doc;
        }
        return { ok: true, doc: next };
      });
    },
    [readOnly, run],
  );
  // T8.2: Ctrl/⌘+D duplicates the selected inputs (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return;
      const ids = nodesRef.current.flatMap((n) => (n.selected ? [sourceIdOfNode(n.id)] : [])).filter((id): id is string => !!id);
      if (ids.length === 0) return;
      e.preventDefault(); // the browser's "bookmark this page"
      duplicateInputs(ids);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duplicateInputs]);

  // T8.2: right-click an input node → Duplicate / Show or hide / Delete.
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      const sourceId = sourceIdOfNode(node.id);
      const source = docRef.current.sources.find((s) => s.id === sourceId);
      if (!source || readOnly) return;
      e.preventDefault();
      const full = docRef.current.sources.length >= LIMITS.maxSources;
      setMenu({
        x: e.clientX,
        y: e.clientY,
        title: source.label,
        items: [
          { label: full ? `Duplicate (${LIMITS.maxSources} inputs max)` : 'Duplicate', disabled: full, onSelect: () => duplicateInputs([source.id]) },
          { label: source.visible ? 'Hide' : 'Show', onSelect: () => run((d) => setSourceVisible(d, source.id, !source.visible)) },
          { label: 'Delete', danger: true, separated: true, onSelect: () => confirmDelete(source.label) && run((d) => deleteSource(d, source.id)) },
        ],
      });
    },
    [duplicateInputs, readOnly, run],
  );

  const addInput = (input: NewInput, at = placeAt) => {
    const result = run((doc) => addSource(doc, { id: newId(), ...input, ...(at ? { board: at } : {}) }));
    if (result.ok) setAdding(false);
  };

  const addOutputNode = (o: NewOutput) => {
    const result = run((doc) => addOutput(doc, { id: newId(), ...o, ...(placeAt ? { board: placeAt } : {}) }));
    if (result.ok) setAddingOutput(false);
  };

  /** T13.4: add from the node library at `at` (a drop point), or in the middle of the view (a click). */
  const addFromLibrary = (spec: AddSpec, drop?: { x: number; y: number }) => {
    if (readOnly || !flow.current) return;
    const pane = document.querySelector('.sc-board__flow')?.getBoundingClientRect();
    const screen = drop ?? (pane ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 } : { x: 0, y: 0 });
    const at = flow.current.screenToFlowPosition(screen);
    switch (spec.type) {
      case 'input':
        addInput(spec.input, at);
        return;
      case 'composition':
        run((d) => addComposition(d, { id: newId(), label: `Main preview ${d.compositions.length + 1}`, board: at }));
        return;
      case 'library':
        run((d) => addSourceFromLibrary(d, spec.item, newId(), at));
        return;
      case 'output':
        if (!spec.preset) {
          setPlaceAt(at);
          setAddingOutput(true);
          return;
        }
        {
          const p = spec.preset;
          run((d) => addOutput(d, { id: newId(), label: p.name, size: { ...p.size }, ...presetSettings(p), board: at }));
        }
    }
  };

  // T8.4: right-click the empty canvas → add an input or an output right there.
  /** Phone top bar (T13.6): what doesn't fit goes in a "More" menu under the button. */
  const openMore = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const edit: MenuItem[] = readOnly
      ? []
      : [
          { label: 'Undo', disabled: !canStep.undo, onSelect: undo },
          { label: 'Redo', disabled: !canStep.redo, onSelect: redo },
          { label: `Add input (${sourceCount}/${LIMITS.maxSources})`, disabled: sourceCount >= LIMITS.maxSources, separated: true, onSelect: () => (setPlaceAt(null), setAdding(true)) },
          { label: `Add output (${outputCount}/${LIMITS.maxOutputs})`, disabled: outputCount >= LIMITS.maxOutputs, onSelect: () => (setPlaceAt(null), setAddingOutput(true)) },
        ];
    setMenu({
      x: r.right - 220,
      y: r.bottom + 4,
      title: 'More',
      items: [
        ...edit,
        { label: 'Team fonts', separated: edit.length > 0, onSelect: () => setShowFonts(true) },
        { label: 'Team library', onSelect: () => setShowLibrary(true) },
        { label: theme === 'dark' ? 'Light theme' : 'Dark theme', onSelect: toggleTheme },
      ],
    });
  };

  const onPaneContextMenu = (e: MouseEvent | React.MouseEvent) => {
    if (readOnly || !flow.current) return;
    e.preventDefault();
    const at = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const doc = docRef.current;
    const inputsFull = doc.sources.length >= LIMITS.maxSources;
    const outputsFull = doc.outputs.length >= LIMITS.maxOutputs;
    const quick = (label: string, input: NewInput) => ({ label, disabled: inputsFull, onSelect: () => addInput(input, at) });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      title: inputsFull ? `Add (${LIMITS.maxSources} inputs max)` : 'Add here',
      items: [
        // T8.7: each with the behaviour that adapts the way people expect (changeable on the node).
        quick('Image (subject)', { kind: 'image', label: 'Image', behavesLike: 'subject' }),
        quick('Logo / SVG', { kind: 'vector', label: 'Logo', behavesLike: 'logo' }),
        quick('Text', { kind: 'text', label: 'Text', behavesLike: 'text' }),
        quick('Background colour / gradient', { kind: 'fill', label: 'Background', behavesLike: 'background' }),
        {
          label: 'Input…',
          disabled: inputsFull,
          onSelect: () => {
            setPlaceAt(at);
            setAdding(true);
          },
        },
        {
          // T12.3: another main preview (e.g. a campaign variant); wire inputs into it and outputs out of it.
          label: canAddComposition(doc) ? 'Main preview' : `Main preview (${LIMITS.maxCompositions} max)`,
          disabled: !canAddComposition(doc),
          separated: true,
          onSelect: () => run((d) => addComposition(d, { id: newId(), label: `Main preview ${d.compositions.length + 1}`, board: at })),
        },
        {
          label: outputsFull ? `Output… (${LIMITS.maxOutputs} max)` : 'Output…',
          disabled: outputsFull,
          onSelect: () => {
            setPlaceAt(at);
            setAddingOutput(true);
          },
        },
      ],
    });
  };

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, dragged: Node[]) => {
      // The shown positions, not React Flow's drag positions: alignment guides may have snapped them (T13.5).
      const shown = new Map(nodesRef.current.map((n) => [n.id, n.position]));
      const doc = withPositions(docRef.current, dragged.map((n) => ({ id: n.id, position: shown.get(n.id) ?? n.position })));
      if (doc === docRef.current || readOnly) return;
      // Recorded for undo; React Flow already shows the new positions.
      history.current.record(docRef.current);
      syncHistory();
      docRef.current = doc;
      setDoc(doc);
      autosave.change(doc);
    },
    [autosave, readOnly, syncHistory],
  );

  return (
    <div className="sc-board">
      <header className="sc-board__bar sc-topbar">
        <div className="sc-topbar__group">
          <button type="button" className="sc-topbar__icon" onClick={props.onBack} aria-label="Back to projects" title="All projects">
            <Icon name="back" />
          </button>
          <strong className="sc-topbar__name" title={initial.doc.name}>
            {initial.doc.name}
          </strong>
          {readOnly && <span className="sc-badge">View only</span>}
          {!readOnly && screen !== 'phone' && (
            <>
              <span className="sc-topbar__sep" aria-hidden="true" />
              <button type="button" className="sc-topbar__icon" onClick={undo} disabled={!canStep.undo} aria-label="Undo" title="Undo (Ctrl/⌘+Z)">
                <Icon name="undo" />
              </button>
              <button type="button" className="sc-topbar__icon" onClick={redo} disabled={!canStep.redo} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)">
                <Icon name="redo" />
              </button>
            </>
          )}
        </div>
        {!readOnly && screen !== 'phone' && (
          <div className="sc-topbar__group sc-topbar__add" role="group" aria-label="Add">
            <button
              type="button"
              aria-label="+ Add input"
              onClick={() => {
                setPlaceAt(null);
                setAdding(true);
              }}
              disabled={sourceCount >= LIMITS.maxSources}
              title={sourceCount >= LIMITS.maxSources ? `${LIMITS.maxSources} inputs max` : 'Add an input (or right-click the canvas)'}
            >
              <Icon name="plus" /> Input <span className="sc-count">{sourceCount}/{LIMITS.maxSources}</span>
            </button>
            <button
              type="button"
              aria-label="+ Add output"
              onClick={() => {
                setPlaceAt(null);
                setAddingOutput(true);
              }}
              disabled={outputCount >= LIMITS.maxOutputs}
              title={outputCount >= LIMITS.maxOutputs ? `${LIMITS.maxOutputs} outputs max` : 'Add an output size (or drag a wire out of the main preview)'}
            >
              <Icon name="plus" /> Output <span className="sc-count">{outputCount}/{LIMITS.maxOutputs}</span>
            </button>
          </div>
        )}
        {readOnly && screen !== 'phone' && (
          <span className="sc-muted sc-topbar__counts">
            {sourceCount} inputs · {outputCount} outputs
          </span>
        )}
        <div className="sc-topbar__group sc-topbar__end">
          {notice && (
            <span className="sc-error" role="alert">
              {notice}
            </span>
          )}
          <span className={`sc-save sc-save--${saveState}`} role="status">
            <span className="sc-save__dot" aria-hidden="true" />
            {STATE_LABEL[saveState]}
            {saveState === 'conflict' && (
              <button type="button" onClick={props.onReload}>
                Reload latest
              </button>
            )}
          </span>
          {screen === 'phone' ? (
            <button type="button" className="sc-topbar__icon" aria-label="More" aria-haspopup="menu" title="More" onClick={(e) => openMore(e.currentTarget)}>
              <Icon name="more" />
            </button>
          ) : (
          <>
          <span className="sc-topbar__sep" aria-hidden="true" />
          <button
            type="button"
            className="sc-topbar__icon sc-theme-toggle"
            onClick={toggleTheme}
            aria-label="Dark theme"
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="sc-topbar__ghost" onClick={() => setShowFonts(true)} title="Team fonts">
            <Icon name="font" /> Fonts
          </button>
          <button type="button" className="sc-topbar__ghost" onClick={() => setShowLibrary(true)} title="Team library">
            <Icon name="library" /> Library
          </button>
          </>
          )}
          {!readOnly && (
            <button
              type="button"
              className="sc-topbar__primary"
              aria-label="Export"
              onClick={() => void autosave.flush().then(() => setExporting(true))}
              disabled={outputCount === 0}
              title={outputCount === 0 ? 'Add an output first' : 'Export outputs'}
            >
              <Icon name="export" /> Export
            </button>
          )}
        </div>
      </header>
      <div
        className="sc-board__canvas"
        // A file dropped outside an input must not make the browser open it (and leave the board).
        onDragOver={(e) => (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(ADD_DRAG_TYPE)) && e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes(ADD_DRAG_TYPE)) {
            e.preventDefault();
            try {
              addFromLibrary(JSON.parse(e.dataTransfer.getData(ADD_DRAG_TYPE)) as AddSpec, { x: e.clientX, y: e.clientY });
            } catch {
              // not ours
            }
          } else if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
      >
        <BoardContext.Provider value={actions}>
          {(!floating || panel === 'library') && (
            <NodeLibrary
              floating={floating}
              onClose={() => setPanel(null)}
              onAdd={(spec) => {
                addFromLibrary(spec);
                if (floating) setPanel(null);
              }}
            />
          )}
          <div className="sc-board__flow" ref={flowEl}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            colorMode={theme}
            onSelectionChange={({ nodes: picked }) => setSelectedNode(picked.length === 1 ? (picked[0]?.id ?? null) : null)}
            onInit={(instance) => {
              flow.current = instance;
            }}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            isValidConnection={isValidConnection}
            edgesReconnectable={!readOnly}
            onReconnectStart={onReconnectStart}
            onReconnect={onReconnect}
            onReconnectEnd={onReconnectEnd}
            onConnectEnd={onConnectEnd}
            reconnectRadius={16}
            connectionRadius={36}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesFocusable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            // T13.5: Figma-style — wheel pans, Ctrl/⌘ + wheel or pinch zooms; drag empty canvas to select (Hand / Space to pan).
            panOnScroll
            zoomOnScroll={false}
            selectionOnDrag={tool === 'select' && !readOnly}
            panOnDrag={tool === 'hand' || readOnly ? true : [1]}
            snapToGrid={grid}
            snapGrid={[16, 16]}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} />
            {minimap && screen !== 'phone' && <MiniMap pannable zoomable position="bottom-right" />}
            <CanvasToolbar
              tool={tool}
              onTool={setTool}
              grid={grid}
              onGrid={setGrid}
              minimap={minimap}
              onMinimap={setMinimap}
              panels={floating && { open: panel, onOpen: setPanel, library: !readOnly }}
              compact={screen === 'phone'}
            />
            <ViewportPortal>
              {guides.vertical !== undefined && <div className="sc-guide sc-guide--v" style={{ transform: `translateX(${guides.vertical}px)` }} />}
              {guides.horizontal !== undefined && <div className="sc-guide sc-guide--h" style={{ transform: `translateY(${guides.horizontal}px)` }} />}
            </ViewportPortal>
            <BoardKeys onTool={setTool} disabled={Boolean(editingMain || editingOutput)} />
          </ReactFlow>
          </div>
          {(!floating || panel === 'inspector') && <Inspector selected={selectedNode} floating={floating} onClose={() => setPanel(null)} />}
          {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
          {editingMain && <MainEditor compositionId={editingMain} onClose={() => setEditingMain(null)} />}
          {editingOutput && <OutputEditor outputId={editingOutput} onClose={() => setEditingOutput(null)} />}
        </BoardContext.Provider>
      </div>
      {adding && <AddInputDialog onAdd={(input) => addInput(input)} onClose={() => setAdding(false)} />}
      {reconnecting && (
        <ReconnectDialog
          label={doc.outputs.find((o) => o.id === reconnecting.outputId)?.label ?? 'output'}
          overrides={doc.outputs.find((o) => o.id === reconnecting.outputId)?.overrides.length ?? 0}
          onChoose={(choice) => {
            run((d) => reconnectOutput(d, reconnecting.outputId, choice, reconnecting.compositionId));
            setReconnecting(null);
          }}
          onClose={() => setReconnecting(null)}
        />
      )}
      {showLibrary && <LibraryDialog teamId={teamId} readOnly={readOnly} sourceCount={sourceCount} run={run} onClose={() => setShowLibrary(false)} />}
      {exporting && <ExportDialog teamId={teamId} projectId={projectId} doc={doc} layoutDeps={layoutDeps} onClose={() => setExporting(false)} />}
      {addingOutput && <AddOutputDialog presets={presets} onAdd={addOutputNode} onClose={() => setAddingOutput(false)} />}
      {showFonts && (
        <FontsDialog
          teamId={teamId}
          readOnly={readOnly}
          teamFonts={teamFonts}
          onUploaded={() => setFontsKey((k) => k + 1)}
          onClose={() => setShowFonts(false)}
        />
      )}
    </div>
  );
}

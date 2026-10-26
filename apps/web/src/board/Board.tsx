import { setEmptyCardWired,
  assetStacks,
  addTextToStack,
  boardStructure,
  addPresetSet,
  connectSet,
  presetFamilies,
  presetSets,
  setComposition,
  addLanguagePair,
  addStack,
  languagePairs,
  pairInputs,
  connectStack,
  fitFrames,
  orderLayers,
  addSource,
  boardGroups,
  setEdgePoints,
  createGroup,
  connectSource,
  deleteSource,
  disconnectOutput,
  disconnectSource,
  duplicateSource,
  LIMITS,
  reconnectNeedsChoice,
  reconnectOutput,
  setSourceVisible, type InputSource, type ProjectDoc, type SizePreset, type SourceError, type SourceResult, type TeamRole } from '@smart-canvas/core';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  MiniMap,
  Panel,
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
import './reactflow.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Autosave, type SaveState } from './autosave';
import { FontsDialog } from '../fonts/FontsDialog';
import { registerTeamFonts, type TeamFont } from '../fonts/loader';
import { MainEditor } from '../editor/MainEditor';
import { OutputEditor } from '../editor/OutputEditor';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { ExportDialog } from './ExportDialog';
import { confirmDelete, Icon } from './LayerRow';
import { History } from './history';
import { LibraryDialog } from './LibraryDialog';
import { ReconnectDialog } from './ReconnectDialog';
import { usedAssetsKey, useAssetSizes, useLayoutDeps } from './layout-deps';
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
  outputIdOfNode,
  portFromHandle,
  sourceIdOfNode,
  layerOfConnection,
  OUTPUT_HANDLE,
  syncNodes,
  withPositions,
  type BoardNode,
  type FlowNode,
  docIdOfNode,
  groupIdOfNode,
  withGroupFrames,
  stackIdOfNode,
  pairIdOfNode,
  setIdOfNode,
  outputOfSetRow,
  isCardNode,
} from './flow';
import { useTheme } from '../ui/theme';
import { align } from './guides';
import { BoardKeys, useStoredFlag } from './board-keys';
import { boxOf, clearSpot, onGrid, presetBlock, tidyPositions, tidySelectionPositions } from './tidy';
import { CanvasToolbar, MultiSelect, FIT_OPTIONS, type CanvasTool } from './CanvasToolbar';
import { Inspector } from './Inspector';
import { RoutedEdge } from './RoutedEdge';
import { changedNodes, downstreamEdges, insertIndex, relatedEdges } from './wires';
import { useCoarsePointer, useScreen } from '../ui/responsive';
import { useLongPress } from '../ui/long-press';
import { TOUCH_NO_PAN, usePinch } from './pinch';
import { deletableNodes, deleteNodes, deleteQuestion } from './delete-nodes';
import { nodeTypes } from './nodes';
import { presetSettings } from './OutputNode';
import { addPictures, uploadPictures } from './stack-upload';
import { HistoryPanel, versionTitle, versionWhen, type Version } from './HistoryPanel';
import { openCounts, useApprovalStates, useReview } from './review';
import { useProjectThumbnail } from './thumbnail';
import { ReviewPanel } from './ReviewPanel';
import { LABEL_ZOOM, ZoomLabels } from './ZoomLabels';
import { ADD, COUNT, COUNTS, GHOST, GROUP_ADD, GROUP_END, GROUP_START, ICON, NAME, PRIMARY, SAVE_BUTTON, SAVE_LONG, SAVE_SHORT, saveClass, saveDotClass, SEP, TOPBAR } from './topbar';

interface Loaded {
  rev: number;
  doc: ProjectDoc;
}
type LoadResult = { key: number } & ({ ok: Loaded } | { error: string });

const ERROR_NOTICE: Partial<Record<SourceError, string>> = {
  limit: `A project can have at most ${LIMITS.maxSources} inputs.`,
  output_limit: `A project can have at most ${LIMITS.maxOutputs} Previews.`,
  invalid: 'That value is out of range.',
};


/** U2: what the save status says where the bar is narrow (tablets, phones). */
const SHORT_LABEL: Record<SaveState, string> = { saved: 'Saved', pending: 'Unsaved', saving: 'Saving…', error: 'Retrying…', conflict: 'Newer version' };

const STATE_LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Save failed, retrying…',
  conflict: 'Someone else saved a newer version.',
};

/** D62: a history version shown read-only on the board. */
interface Previewing {
  version: Version;
  doc: ProjectDoc;
}

export function Board(props: { teamId: string; projectId: string; userId: string; readOnly: boolean; role: TeamRole; onBack: () => void }) {
  const { teamId, projectId, readOnly } = props;
  const url = `/teams/${teamId}/projects/${projectId}`;
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Previewing | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /** The live board's pending edits, saved before a preview replaces it (set by the canvas). */
  const flush = useRef<() => Promise<void>>(() => Promise.resolve());

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

  const history: HistoryControls = {
    open: historyOpen,
    previewing: previewing?.version ?? null,
    error: historyError,
    toggle: () => setHistoryOpen((o) => !o),
    view: async (version) => {
      setHistoryError(null);
      try {
        await flush.current();
        const v = await api<Version & { doc: ProjectDoc }>('GET', `${url}/versions/${version.id}`);
        setPreviewing({ version, doc: v.doc });
      } catch {
        setHistoryError('Could not open that version.');
      }
    },
    // Back to the live board: loaded again, so it shows the latest save.
    close: () => {
      setPreviewing(null);
      setHistoryError(null);
      setReloadKey((k) => k + 1);
    },
    restore: async () => {
      if (!previewing) return;
      setHistoryError(null);
      try {
        await api('POST', `${url}/versions/${previewing.version.id}/restore`);
        setPreviewing(null);
        setReloadKey((k) => k + 1);
      } catch {
        setHistoryError('Could not restore that version.');
      }
    },
    flush: () => flush.current(),
  };

  // Only data fetched for the current reload counts: never remount the canvas on a stale rev.
  if (!result || result.key !== reloadKey) return <p className="sc-muted">Loading…</p>;
  if ('error' in result) return <p className="sc-error">{result.error}</p>;
  return (
    <BoardCanvas
      key={previewing ? `v:${previewing.version.id}` : reloadKey}
      teamId={teamId}
      projectId={projectId}
      userId={props.userId}
      role={props.role}
      url={url}
      initial={previewing ? { rev: previewing.version.rev, doc: { ...previewing.doc, name: result.ok.doc.name } } : result.ok}
      readOnly={readOnly || Boolean(previewing)}
      canEdit={!readOnly}
      history={history}
      historyRefresh={reloadKey}
      flushRef={flush}
      onBack={props.onBack}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}

/** D62: the history panel and preview, kept by Board across canvas remounts. */
interface HistoryControls {
  open: boolean;
  previewing: Version | null;
  error: string | null;
  toggle: () => void;
  view: (v: Version) => Promise<void>;
  close: () => void;
  restore: () => Promise<void>;
  flush: () => Promise<void>;
}

/** Shift-click adds a panel to the selection or takes it out, like Figma; Ctrl / ⌘ too (React Flow's default). */
const MULTI_SELECT_KEYS = ['Shift', 'Meta', 'Control'];
const ZOOM_LIMITS = { min: 0.1, max: 2 };
/** D58 (Q8): on touch, below this zoom a tap on a panel zooms to it instead of pressing what is inside it. */
const FAR_ZOOM = 0.5;

/** T13.8: every wire can carry reroute points. */
const edgeTypes = { routed: RoutedEdge };

/** A layer wire into a composition row (D56: the only kind); the node id from React Flow. */
function connectLayer(doc: ProjectDoc, sourceId: string, target: string | null, port: number | undefined): SourceResult {
  const composition = compositionIdOfNode(target);
  return composition ? connectSource(doc, sourceId, port, composition) : { ok: false, error: 'not_found' };
}

function disconnectLayer(doc: ProjectDoc, sourceId: string, target: string): SourceResult {
  const composition = compositionIdOfNode(target);
  return composition ? disconnectSource(doc, sourceId, composition) : { ok: false, error: 'not_found' };
}

function BoardCanvas(props: {
  teamId: string;
  projectId: string;
  userId: string;
  role: TeamRole;
  url: string;
  initial: Loaded;
  readOnly: boolean;
  /** The person may edit (readOnly is also on while a history version is shown). */
  canEdit: boolean;
  history: HistoryControls;
  historyRefresh: number;
  flushRef: React.MutableRefObject<() => Promise<void>>;
  onBack: () => void;
  onReload: () => void;
}) {
  const { teamId, projectId, url, initial, readOnly } = props;
  const docRef = useRef(initial.doc);
  /** D49: the Preset node menu items (set each render; read by the group's out port callbacks). */
  /** D49: the page-3 shape is applied once, when the project opens. */
  const structured = useRef(false);
  const presetItemsRef = useRef<(at: { x: number; y: number }) => MenuItem[]>(() => []);
  const [doc, setDoc] = useState(initial.doc);
  /** The composition open in the master preview editor (the master or one of its layouts). */
  const [editingMain, setEditingMain] = useState<string | null>(null);
  const [editingOutput, setEditingOutput] = useState<string | null>(null);
  const [outputComments, setOutputComments] = useState(false);
  /** D63: the Review panel (in the inspector's place, like History). */
  const [reviewOpen, setReviewOpen] = useState(false);
  /** U2: the side panel hidden on desktop, for more canvas (remembered on this device). */
  const [inspectorHidden, setInspectorHidden] = useStoredFlag('sc-inspector-hidden', false);
  /** D63: the review of Previews; polled while a Preview editor or the Review panel is open. */
  const review = useReview(url, Boolean(editingOutput) || reviewOpen);
  const reloadReview = review.reload;
  const openCommentCounts = useMemo(() => openCounts(review.data), [review.data]);
  const openComments = useMemo(() => [...openCommentCounts.values()].reduce((n, c) => n + c, 0), [openCommentCounts]);
  const [nodes, setNodes] = useState<BoardNode[]>(() => docToNodes(initial.doc));
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edges, setEdges] = useState(() => docToEdges(initial.doc));
  const [sourceCount, setSourceCount] = useState(initial.doc.sources.length);
  const [theme, toggleTheme] = useTheme();
  /** T13.2: the one selected node (React Flow id), shown in the inspector. */
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  /** D40: the picture of the selected Assets card shown in the inspector. */
  const [stackFocus, setStackFocus] = useState<string | null>(null);
  const flow = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const [outputCount, setOutputCount] = useState(initial.doc.outputs.length);
  const [reconnecting, setReconnecting] = useState<{ outputId: string; compositionId: string } | null>(null);
  /** The export dialog: closed, or open with all outputs (no list) or the given ones chosen (T13.7). */
  const [exporting, setExporting] = useState<false | { outputs?: string[]; set?: string }>(false);
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
    if (readOnly) return;
    const ref = props.flushRef;
    ref.current = () => autosave.flush();
    return () => {
      ref.current = () => Promise.resolve();
    };
  }, [autosave, readOnly, props.flushRef]);

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

  // T13.7: group frames around their members (derived each render), and which frames are selected.
  const [selectedGroups, setSelectedGroups] = useState<ReadonlySet<string>>(new Set());
  const displayNodes = useMemo((): FlowNode[] => withGroupFrames(nodes, boardGroups(doc), doc, selectedGroups), [nodes, doc, selectedGroups]);
  const displayNodesRef = useRef(displayNodes);
  const selectedGroupsRef = useRef(selectedGroups);
  useLayoutEffect(() => {
    selectedGroupsRef.current = selectedGroups;
  }, [selectedGroups]);
  useEffect(() => {
    displayNodesRef.current = displayNodes;
  }, [displayNodes]);
  const coarse = useCoarsePointer();
  // T13.8: wires dim unless they touch the selection; the wires a change flows along pulse once.
  const [pulsing, setPulsing] = useState<ReadonlySet<string>>(new Set());
  const prevDoc = useRef(doc);
  useEffect(() => {
    const changed = changedNodes(prevDoc.current, doc);
    prevDoc.current = doc;
    if (changed.size === 0) return;
    setPulsing(downstreamEdges(doc, changed));
    const t = setTimeout(() => setPulsing(new Set()), 700);
    return () => clearTimeout(t);
  }, [doc]);
  /** Panels selected now (group frames aside): two or more show the selection bar (group / delete; works on touch too). */
  /**
   * D58: on touch a panel moves only once it is selected (tap, then drag); a finger on one that isn't moves the board,
   * so large panels never trap the view.
   */
  const flowNodes = useMemo(() => (coarse ? displayNodes.map((n) => (n.draggable === false || n.selected ? n : { ...n, draggable: false })) : displayNodes), [displayNodes, coarse]);
  const selectedCount = useMemo(() => displayNodes.filter((n) => n.selected && !n.id.startsWith('grp:')).length, [displayNodes]);
  const displayEdges = useMemo(() => {
    const selectedNodes = new Set(displayNodes.filter((n) => n.selected).map((n) => n.id));
    const selectedEdges = new Set(edges.filter((e) => e.selected).map((e) => e.id));
    const focus = selectedNodes.size + selectedEdges.size > 0;
    const related = focus ? relatedEdges(edges, selectedNodes, selectedEdges) : null;
    // Touch: a wider invisible strip along each wire, so a finger can select it (then Disconnect).
    const touchWidth = coarse ? { interactionWidth: 36 } : null;
    if (!related && pulsing.size === 0 && !touchWidth) return edges;
    return edges.map((e) => {
      const extra = `${related && !related.has(e.id) ? ' sc-edge--dim' : ''}${pulsing.has(e.id) ? ' sc-edge--pulse' : ''}`;
      return extra || touchWidth ? { ...e, ...touchWidth, ...(extra ? { className: `${e.className ?? ''}${extra}` } : {}) } : e;
    });
  }, [edges, displayNodes, pulsing, coarse]);

  // T13.5: a dragged node snaps to other nodes' edges and centres; the guide lines show where.
  const [guides, setGuides] = useState<{ vertical?: number; horizontal?: number }>({});
  /** Grid snap on / Alt held, for handlers (synced below, after their state). */
  const gridRef = useRef(false);
  const altRef = useRef(false);
  const onNodesChange = useCallback((all: NodeChange<FlowNode>[]) => {
    // T13.7: group frames are derived; selecting one is tracked here, dragging one moves its members.
    const changes: NodeChange<BoardNode>[] = [];
    for (const c of all) {
      const groupNode = 'id' in c && c.id.startsWith('grp:') ? c.id : null;
      if (!groupNode) changes.push(c as NodeChange<BoardNode>);
      else if (c.type === 'select') setSelectedGroups((sel) => (c.selected ? new Set(sel).add(groupNode) : new Set([...sel].filter((x) => x !== groupNode))));
      else if (c.type === 'position' && c.position) {
        const frame = displayNodesRef.current.find((n) => n.id === groupNode);
        const g = groupIdOfNode(groupNode);
        const members = boardGroups(docRef.current).find((x) => x.id === g)?.nodes ?? [];
        if (!frame) continue;
        const dx = c.position.x - frame.position.x;
        const dy = c.position.y - frame.position.y;
        for (const n of nodesRef.current)
          if (members.includes(docIdOfNode(n.id) ?? '')) changes.push({ type: 'position', id: n.id, position: { x: n.position.x + dx, y: n.position.y + dy }, dragging: c.dragging });
      }
    }
    if (changes.length === 0) return;
    const [moving] = changes;
    if (changes.length === 1 && moving?.type === 'position') {
      const ns = nodesRef.current;
      const node = ns.find((n) => n.id === moving.id);
      const size = (n: BoardNode) => ({ w: n.measured?.width ?? 0, h: n.measured?.height ?? 0 });
      // D57: with grid snap on the grid decides (React Flow snaps the drag); Alt held skips snapping for this move.
      if (moving.dragging && (gridRef.current || altRef.current)) setGuides({});
      else if (moving.dragging && moving.position && node && size(node).w) {
        const others = ns.filter((n) => n.id !== moving.id && !n.selected && size(n).w).map((n) => ({ x: n.position.x, y: n.position.y, ...size(n) }));
        const a = align({ ...moving.position, ...size(node) }, others);
        moving.position = { x: a.x ?? moving.position.x, y: a.y ?? moving.position.y };
        setGuides({ vertical: a.vertical, horizontal: a.horizontal });
      } else if (!moving.dragging) setGuides({});
    }
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);
  // Every screen starts with Select (owner, 2026-10-23): the mouse selects and moves panels, a drag on empty canvas
  // selects several; Hand (or the wheel, Space) moves the board. D58, touch: one finger moves the board, a tap
  // selects, a selected panel follows the finger, two fingers pinch and pan.
  const [tool, setTool] = useState<CanvasTool>('select');
  /** Space held: the Hand tool for as long as it is held (spring-loaded); the toolbar shows it. */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const activeTool: CanvasTool = spaceHeld ? 'hand' : tool;
  const activeToolRef = useRef(activeTool);
  useLayoutEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  const screen = useScreen();
  const floating = screen === 'phone' ? 'sheet' : screen === 'tablet' ? 'overlay' : undefined;
  /** Tablet / phone: the one floating panel that is open. */
  const [panel, setPanel] = useState<'library' | 'inspector' | null>(null);
  const flowEl = useRef<HTMLDivElement>(null);
  // D58: two fingers anywhere pinch-zoom and pan the board, panels and their controls included.
  const pinchTarget = useCallback(() => flow.current, []);
  usePinch(flowEl, pinchTarget, ZOOM_LIMITS);
  // D33 / D58: a long-press opens the menu of what is under the finger (a panel's, a port's, the canvas menu).
  useLongPress(flowEl, 500);
  /** D58, touch: Select several is on — taps add or take out panels, one finger on empty canvas draws a box. */
  const [several, setSeveral] = useState(false);
  /** D58 (Q8): zoomed out on touch — panels are too small to tap their controls, so a tap zooms to the panel. */
  const [farZoom, setFarZoom] = useState(false);
  /** U3: zoomed out far enough that panels get name tags (ZoomLabels); `--zoom-inv` keeps the tags' screen size. */
  const [zoomedOut, setZoomedOut] = useState(false);
  const zoomChanged = useCallback((zoom: number) => {
    flowEl.current?.style.setProperty('--zoom-inv', String(1 / zoom));
    setZoomedOut(zoom < LABEL_ZOOM);
  }, []);
  const far = coarse && farZoom && !several;
  const farRef = useRef(false);
  useLayoutEffect(() => {
    farRef.current = far;
  }, [far]);
  // A press on a panel's content while zoomed out reaches nothing inside it (no button, no keyboard for a field);
  // its tap zooms to the panel and selects it. Ports keep their taps (tap a port, then a target, to wire).
  useEffect(() => {
    const el = flowEl.current;
    if (!el) return;
    const panelOf = (e: Event) => {
      const t = e.target as Element | null;
      if (!farRef.current || !t || t.closest('.react-flow__handle')) return null;
      const panel = t.closest<HTMLElement>('.react-flow__node');
      return panel && panel !== t ? panel : null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !panelOf(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent) => {
      const panel = panelOf(e);
      const id = panel?.dataset.id;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      const picked = displayNodesRef.current.filter((n) => n.selected && n.id !== id).map((n) => ({ type: 'select' as const, id: n.id, selected: false }));
      onNodesChange([...picked, { type: 'select', id, selected: true }]);
      void flow.current?.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1, padding: 0.15 });
    };
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('click', onClick, true);
    };
  }, [onNodesChange]);
  const [grid, setGrid] = useStoredFlag('sc-board-grid', false);
  useLayoutEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  /** Alt / Option held: a drag skips grid snap and the alignment guides (D57). */
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const set = (on: boolean) => {
      if (altRef.current === on) return;
      altRef.current = on;
      setAltHeld(on);
    };
    const down = (e: KeyboardEvent) => e.key === 'Alt' && set(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && set(false);
    const off = () => set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
    };
  }, []);
  /** Tidy glides panels into place (the class is on for one move). */
  const [tidying, setTidying] = useState(false);
  /** A short notice after Tidy, with Undo (D57). */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
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
    (next: ProjectDoc, key: string | null = null) => {
      // D45: rows stay in the layer comp's groups (logo, headline, elements, background) whatever the edit.
      const doc = orderLayers(next);
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
    (op: (doc: ProjectDoc) => SourceResult, opts?: { silent?: boolean }): SourceResult => {
      const result = op(docRef.current);
      if (result.ok) {
        setNotice(null);
        if (opts?.silent) show(result.doc);
        else apply(result.doc);
      } else {
        setNotice(ERROR_NOTICE[result.error] ?? 'That change could not be made.');
      }
      return result;
    },
    [apply, show],
  );

  const [presets, setPresets] = useState<SizePreset[]>([]);
  const [presetsRev, setPresetsRev] = useState(0);
  const reloadPresets = useCallback(() => setPresetsRev((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<SizePreset[]>('GET', `/teams/${teamId}/presets`).then(
      (list) => live && setPresets(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [teamId, presetsRev]);
  const { sizes, remember } = useAssetSizes(teamId, usedAssetsKey(doc));
  const { deps: layoutDeps, missingFonts } = useLayoutDeps(doc, sizes, teamFonts.map((f) => f.id).join(','));
  const approvals = useApprovalStates(doc, layoutDeps, review.data);
  useProjectThumbnail({ teamId, projectUrl: url, doc, deps: layoutDeps, saveState, canEdit: !readOnly });

  // D37: once a picture's visible pixels are known, its unfitted frames hug them (in place: nothing moves on
  // screen). Not an undo step — it's how the doc is shown; undoing to an unfitted doc just fits it again.
  useEffect(() => {
    if (readOnly) return;
    // D45 too: a project saved before the fixed order gets it here, also without an undo step; and D49: on open, a
    // project made before the page-3 board is brought into its shape (asset nodes, one Layer Comp, Preset nodes) —
    // once, so a node deleted afterwards stays deleted.
    const first = !structured.current;
    const base = first ? boardStructure(docRef.current) : docRef.current;
    structured.current = true;
    const fitted = orderLayers(fitFrames(base, sizes));
    // On open the structure may place nodes (a Sizes preset's Previews): the board takes those positions.
    if (fitted !== docRef.current) show(fitted, first && base !== docRef.current);
  }, [doc, sizes, readOnly, show]);

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
      userId: props.userId,
      role: props.role,
      projectUrl: url,
      review: review.data,
      reloadReview,
      approvals,
      reviewApprove: async (outputId: string, fingerprint: string | null) => {
        const path = `${url}/review/approvals/${encodeURIComponent(outputId)}`;
        await (fingerprint ? api('PUT', path, { fingerprint }) : api('DELETE', path)).catch(() => setNotice('Could not change the approval. Try again.'));
        reloadReview();
      },
      doc,
      openMainEditor: (compositionId: string = MAIN_ID) => setEditingMain(compositionId),
      openOutputEditor: (id: string, opts?: { comments?: boolean }) => {
        setOutputComments(Boolean(opts?.comments));
        setEditingOutput(id);
      },
      exportOutputs: (ids: string[], set?: string) => void autosave.flush().then(() => setExporting({ outputs: ids, ...(set ? { set } : {}) })),
      author,
      teamFonts,
      sourceCount,
      // Typing in one input's field is one undo step (coalesced by key).
      editSource: (id: string, edit: (s: InputSource) => InputSource) => apply(withSource(docRef.current, id, edit), `source:${id}`),
      layoutDeps,
      missingFonts,
      presets,
      reloadPresets,
      rememberAsset: remember,
      disconnectOutput: disconnect,
      reconnectOutput: reconnect,
      stackFocus,
      setStackFocus,
      run,
    }),
    [teamId, readOnly, props.userId, props.role, url, review.data, reloadReview, approvals, doc, teamFonts, sourceCount, layoutDeps, missingFonts, presets, reloadPresets, remember, disconnect, reconnect, author, apply, run, autosave, stackFocus],
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
    [run, reconnect],
  );

  // Edges are controlled: apply selection here; removals go through the doc (onEdgesDelete).
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selection = changes.filter((c) => c.type === 'select');
    if (selection.length) setEdges((es) => applyEdgeChanges(selection, es));
  }, []);

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
    [readOnly, run],
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
        // D49: a card's one wire into the Layer Comp stands for all its items' wires.
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
    [run, disconnect],
  );

  /**
   * Delete / Backspace (BoardKeys): selected nodes are deleted from the doc (one confirm, one undo step;
   * React Flow's own removal would only drop them from the screen); selected wires alone are disconnected.
   */
  const deleteSelection = useCallback(() => {
    const f = flow.current;
    if (!f) return;
    const picked = f.getNodes().filter((n) => n.selected);
    if (picked.length === 0) {
      const wires = f.getEdges().filter((e) => e.selected);
      if (wires.length) onEdgesDelete(wires);
      return;
    }
    const targets = deletableNodes(docRef.current, picked.map((n) => n.id));
    if (targets.length && window.confirm(deleteQuestion(targets))) run((d) => deleteNodes(d, targets));
  }, [run, onEdgesDelete]);

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

  /** D49: a wire dragged out of the Layer Comp group onto empty canvas (or a right-click on its out port) offers the Preset nodes. */
  const openPresets = useCallback(
    (client: { x: number; y: number }) => {
      if (readOnly || !flow.current) return;
      const at = flow.current.screenToFlowPosition(client);
      setMenu({ x: client.x, y: client.y, title: 'Add a Preset node', items: presetItemsRef.current(at) });
    },
    [readOnly],
  );
  /** Right-click on the group's out port: the Preset nodes (before the node's own menu). */
  const onPortContextMenu = (e: React.MouseEvent) => {
    const handle = (e.target as Element).closest?.('.react-flow__handle');
    if (!handle || handle.getAttribute('data-nodeid') !== MAIN_ID || handle.getAttribute('data-handleid') !== OUTPUT_HANDLE) return;
    e.preventDefault();
    e.stopPropagation();
    openPresets({ x: e.clientX, y: e.clientY });
  };
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
    [readOnly, openPresets],
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
  /** T13.7: groups the selected nodes (Ctrl/⌘+G, or the menu on a selection). */
  const groupSelection = useCallback(() => {
    if (readOnly) return;
    const ids = nodesRef.current.flatMap((n) => (n.selected ? [docIdOfNode(n.id)] : [])).filter((id): id is string => !!id);
    if (ids.length === 0) return;
    run((doc) => createGroup(doc, { id: newId(), label: `Group ${(doc.groups?.length ?? 0) + 1}`, nodes: ids }));
  }, [readOnly, run]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'g') return;
      e.preventDefault(); // the browser's "find next"
      groupSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupSelection]);
  /** Right-click on a selection of two or more nodes: group them. */
  const onSelectionContextMenu = useCallback(
    (e: React.MouseEvent, picked: Node[]) => {
      const count = picked.filter((n) => !n.id.startsWith('grp:')).length;
      if (readOnly || count < 2) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, title: `${count} nodes`, items: [{ label: `Group ${count} nodes (Ctrl/⌘+G)`, onSelect: groupSelection }] });
    },
    [readOnly, groupSelection],
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
      // A node in a multi-selection: the selection's menu (T13.7).
      const picked = nodesRef.current.filter((n) => n.selected);
      if (node.selected && picked.length >= 2) return onSelectionContextMenu(e, picked);
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
    [duplicateInputs, readOnly, run, onSelectionContextMenu],
  );

  /** N4: where a Preset node of `rows` sizes goes near `at` — its node and its Previews clear of every other node. */
  const clearAt = (at: { x: number; y: number }, rows: number) => clearSpot(nodesRef.current.filter((n) => !n.hidden).map(boxOf), presetBlock(rows), at);

  /** D46 / D49: a Preset node with every size of a preset family (e.g. the 7 GDN sizes), wired to the Layer Comp. */
  const addSet = (family: string, at: { x: number; y: number }) => {
    const sizes = presetFamilies(presets).find((f) => f.label === family)?.presets ?? [];
    run((d) => addPresetSet(d, { id: newId(), label: family, board: clearAt(at, sizes.length), sizes: sizes.map((p) => ({ id: newId(), label: p.name, ...presetSettings(p), size: { ...p.size } })) }));
  };

  /** D49: the Preset nodes on offer — every preset family, then a custom one (the user's own sizes). */
  const presetItems = (at: { x: number; y: number }): MenuItem[] => {
    const doc = docRef.current;
    return [
      ...presetFamilies(presets).map((f) => ({
        label: `${f.label} preset (${f.presets.length} ${f.presets.length === 1 ? 'size' : 'sizes'})`,
        disabled: doc.outputs.length + f.presets.length > LIMITS.maxOutputs,
        onSelect: () => addSet(f.label, at),
      })),
      { label: 'Custom preset…', separated: true, onSelect: () => run((d) => addPresetSet(d, { id: newId(), label: window.prompt('Preset name', 'Custom')?.trim() || 'Custom', board: clearAt(at, 1), sizes: [] })) },
    ];
  };

  useEffect(() => {
    presetItemsRef.current = presetItems;
  });

  /** D49 (page 3): what can be added on the board — the asset nodes, then the Preset nodes. */
  const addItems = (at: { x: number; y: number }): MenuItem[] => {
    const full = docRef.current.sources.length >= LIMITS.maxSources;
    return [
      { label: 'Logo node', disabled: full, onSelect: () => run((d) => addStack(d, { id: newId(), kind: 'logo', board: at })) },
      { label: 'Headline node (Khmer / English)', disabled: full, onSelect: () => run((d) => addLanguagePair(d, { id: newId(), km: newId(), en: newId(), board: at })) },
      {
        label: 'Text node',
        disabled: full,
        onSelect: () =>
          run((d) => {
            const id = newId();
            const r = addStack(d, { id, kind: 'text', board: at });
            return r.ok ? addTextToStack(r.doc, id, { id: newId(), label: 'Text 1' }) : r;
          }),
      },
      { label: 'Image node', disabled: full, onSelect: () => run((d) => addStack(d, { id: newId(), label: 'Image', board: at })) },
      {
        label: 'Background node',
        disabled: full,
        onSelect: () =>
          run((d) => {
            const id = newId();
            const r = addSource(d, { id, kind: 'image', label: 'Background', behavesLike: 'background', board: at });
            return r.ok ? connectSource(r.doc, id) : r;
          }),
      },
      ...presetItems(at).map((item, i) => ({ ...item, separated: i === 0 })),
    ];
  };
  /**
   * D49: where + Add puts a node: asset nodes at the end of the top row, Preset nodes in a column under the Layer
   * Comp group (each below the last), so nothing lands on top of the group.
   */
  const nextSpot = (): { asset: { x: number; y: number }; preset: { x: number; y: number } } => {
    const d = docRef.current;
    const main = d.compositions.find((c) => c.id === MAIN_ID);
    const ns = flow.current?.getNodes() ?? [];
    const right = (n: { position: { x: number }; measured?: { width?: number } }) => n.position.x + (n.measured?.width ?? 280);
    const top = ns.filter((n) => n.type === 'assetsNode' || n.type === 'textNode' || n.type === 'headlineNode' || n.type === 'inputNode');
    const sets = ns.filter((n) => n.type === 'presetNode');
    const below = (n: { position: { y: number }; measured?: { height?: number } }) => n.position.y + (n.measured?.height ?? 400);
    return {
      asset: { x: top.length ? Math.max(...top.map(right)) + 40 : 0, y: top.length ? Math.min(...top.map((n) => n.position.y)) : 0 },
      preset: { x: main?.board.x ?? 0, y: sets.length ? Math.max(...sets.map(below)) + 60 : (main?.board.y ?? 0) + 560 },
    };
  };
  const openAdd = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const spot = nextSpot();
    const assets = addItems(spot.asset);
    const presets = presetItems(spot.preset);
    setMenu({ x: r.left, y: r.bottom + 4, title: 'Add', items: [...assets.slice(0, assets.length - presets.length), ...addItems(spot.preset).slice(assets.length - presets.length)] });
  };

  /** D62: the history panel takes the inspector's place (on tablets and phones, the one floating panel). */
  const openHistory = () => {
    if (props.history.open) closeHistory();
    else {
      setPanel(null);
      setReviewOpen(false);
      props.history.toggle();
    }
  };
  /** U2: the team's fonts and library, under the Assets button. */
  const openAssets = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 4,
      title: 'Assets',
      items: [
        { label: 'Team fonts', onSelect: () => setShowFonts(true) },
        { label: 'Team library', onSelect: () => setShowLibrary(true) },
      ],
    });
  };
  /** D63: the Review panel; it closes History (and a version shown) first. */
  const openReview = () => {
    if (!reviewOpen) {
      if (props.history.open) closeHistory();
      setPanel(null);
    }
    setReviewOpen((o) => !o);
  };
  /** Closing the panel leaves a version being shown too. */
  const closeHistory = () => {
    if (props.history.previewing) props.history.close();
    props.history.toggle();
  };

  /** Phone top bar (T13.6): what doesn't fit goes in a "More" menu under the button. */
  const openMore = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const edit: MenuItem[] = readOnly
      ? []
      : [
          { label: 'Undo', disabled: !canStep.undo, onSelect: undo },
          { label: 'Redo', disabled: !canStep.redo, onSelect: redo },
          ...addItems(nextSpot().asset).map((item, i) => ({ ...item, separated: i === 0 })),
        ];
    setMenu({
      x: r.right - 220,
      y: r.bottom + 4,
      title: 'More',
      items: [
        ...edit,
        { label: 'Team fonts', separated: edit.length > 0, onSelect: () => setShowFonts(true) },
        { label: 'Team library', onSelect: () => setShowLibrary(true) },
        { label: 'History', onSelect: openHistory },
        { label: 'Review', onSelect: openReview },
        { label: theme === 'dark' ? 'Light theme' : 'Dark theme', onSelect: toggleTheme },
      ],
    });
  };

  // T8.4 / D49: right-click the empty canvas → add an asset node or a Preset node right there.
  const onPaneContextMenu = (e: MouseEvent | React.MouseEvent) => {
    if (readOnly || !flow.current) return;
    e.preventDefault();
    const at = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setMenu({ x: e.clientX, y: e.clientY, title: 'Add here', items: [...addItems(at), { label: selectedCount >= 2 ? 'Tidy selection' : 'Tidy board', separated: true, onSelect: tidy }] });
  };

  /**
   * N4 / D57 Tidy (one undo step): two or more panels selected → those panels in an even grid; otherwise the whole
   * board laid out again, then fitted on screen. Positions land on the grid with grid snap on; panels glide there;
   * a notice says what happened, with Undo.
   */
  const tidy = () => {
    if (readOnly) return;
    const picked = displayNodesRef.current.filter((n) => n.selected && !n.hidden && !n.id.startsWith('grp:'));
    const selection = picked.length >= 2;
    let moves = selection ? tidySelectionPositions(picked) : tidyPositions(docRef.current, nodesRef.current);
    if (gridRef.current) moves = moves.map((m) => ({ ...m, position: onGrid(m.position, 16) }));
    const at = new Map(nodesRef.current.map((n) => [n.id, n.position]));
    const changed = moves.some((m) => {
      const p = at.get(m.id);
      return !p || Math.round(p.x) !== Math.round(m.position.x) || Math.round(p.y) !== Math.round(m.position.y);
    });
    if (!changed) return setToast(selection ? 'The selected panels are already tidy' : 'The board is already tidy');
    history.current.record(docRef.current);
    syncHistory();
    setTidying(true);
    setTimeout(() => setTidying(false), 320);
    show(withPositions(docRef.current, moves), true);
    setToast(selection ? `${picked.length} panels tidied` : 'Board tidied');
    if (!selection) requestAnimationFrame(() => void flow.current?.fitView({ ...FIT_OPTIONS, duration: 200 }));
  };

  /**
   * Writes panel positions into the doc and saves them (one undo step; `coalesce` merges a quick run of the same
   * kind of move, e.g. held arrow keys, into one).
   */
  const lastMove = useRef<{ kind: string; at: number } | null>(null);
  const savePositions = useCallback(
    (moves: { id: string; position: { x: number; y: number } }[], coalesce?: string) => {
      const doc = withPositions(docRef.current, moves);
      if (doc === docRef.current || readOnly) return;
      const now = Date.now();
      const merge = !!coalesce && lastMove.current?.kind === coalesce && now - lastMove.current.at < 800;
      lastMove.current = coalesce ? { kind: coalesce, at: now } : null;
      // Recorded for undo; React Flow already shows the new positions.
      if (!merge) {
        history.current.record(docRef.current);
        syncHistory();
      }
      docRef.current = doc;
      setDoc(doc);
      autosave.change(doc);
    },
    [autosave, readOnly, syncHistory],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, dragged: Node[]) => {
      // The shown positions, not React Flow's drag positions: alignment guides may have snapped them (T13.5).
      const shown = new Map(nodesRef.current.map((n) => [n.id, n.position]));
      // T13.7: a dragged group frame stands for its members.
      const groups = boardGroups(docRef.current);
      const ids = new Set(
        dragged.flatMap((n) => {
          const g = groupIdOfNode(n.id);
          const members = g ? (groups.find((x) => x.id === g)?.nodes ?? []) : null;
          return members ? nodesRef.current.filter((m) => members.includes(docIdOfNode(m.id) ?? '')).map((m) => m.id) : [n.id];
        }),
      );
      savePositions([...ids].map((id) => ({ id, position: shown.get(id) ?? { x: 0, y: 0 } })).filter((m) => shown.has(m.id)));
    },
    [savePositions],
  );

  /**
   * D58: a box drawn with a finger ends without a click, and React Flow waits for one to finish the box — it would
   * swallow the next tap. Give it that click as the finger lifts (a mouse box ends with a real one).
   */
  const onSelectionEnd = useCallback((e: React.MouseEvent) => {
    if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') return;
    const pane = flowEl.current?.querySelector('.react-flow__pane');
    pane?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, []);

  /** Clears the selection: panels and group frames (Esc, the selection bar's ×). */
  const clearSelection = useCallback(() => {
    const picked = displayNodesRef.current.filter((n) => n.selected);
    if (picked.length) onNodesChange(picked.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
  }, [onNodesChange]);

  /** Ctrl / ⌘ + A: every panel (with the Select tool). */
  const selectAll = useCallback(() => {
    if (activeToolRef.current !== 'select') return;
    setNodes((ns) => ns.map((n) => (n.selected ? n : { ...n, selected: true })));
  }, []);

  /**
   * Arrow keys move the selected panels (and the members of selected groups): 1 board px, Shift 10, or one grid
   * step (16) with grid snap on. Saved like a drag; a run of presses close together is one undo step.
   */
  const nudge = useCallback(
    (dx: number, dy: number, big: boolean) => {
      if (readOnly || activeToolRef.current !== 'select') return false;
      const groups = boardGroups(docRef.current);
      const members = new Set([...selectedGroupsRef.current].flatMap((g) => groups.find((x) => x.id === groupIdOfNode(g))?.nodes ?? []));
      const picked = nodesRef.current.filter((n) => n.selected || members.has(docIdOfNode(n.id) ?? ''));
      if (picked.length === 0) return false;
      const step = gridRef.current ? 16 : big ? 10 : 1;
      const moved = picked.map((n) => ({ id: n.id, position: { x: n.position.x + dx * step, y: n.position.y + dy * step } }));
      const at = new Map(moved.map((m) => [m.id, m.position]));
      setNodes((ns) => ns.map((n) => (at.has(n.id) ? { ...n, position: at.get(n.id) as { x: number; y: number } } : n)));
      savePositions(moved, 'nudge');
      return true;
    },
    [readOnly, savePositions],
  );


  return (
    <div className="sc-board">
      <header className={TOPBAR}>
        <div className={GROUP_START}>
          <button type="button" className={ICON} onClick={props.onBack} aria-label="Back to projects" title="All projects">
            <Icon name="back" />
          </button>
          <strong className={NAME} title={initial.doc.name}>
            {initial.doc.name}
          </strong>
          {readOnly && !props.history.previewing && <span className="sc-badge">View only</span>}
          {!readOnly && screen !== 'phone' && (
            <>
              <span className={SEP} aria-hidden="true" />
              <button type="button" className={ICON} onClick={undo} disabled={!canStep.undo} aria-label="Undo" title="Undo (Ctrl/⌘+Z)">
                <Icon name="undo" />
              </button>
              <button type="button" className={ICON} onClick={redo} disabled={!canStep.redo} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)">
                <Icon name="redo" />
              </button>
            </>
          )}
        </div>
        {!readOnly && screen !== 'phone' && (
          <div className={GROUP_ADD} role="group" aria-label="Add">
            {/* D49: one menu for every node — the asset nodes and the Preset nodes (as right-click on the canvas). */}
            <button type="button" className={ADD} aria-label="+ Add" aria-haspopup="menu" onClick={(e) => openAdd(e.currentTarget)} title="Add a node (or right-click the canvas)">
              <Icon name="plus" /> Add
            </button>
          </div>
        )}
        {readOnly && screen !== 'phone' && (
          <span className={COUNTS}>
            {sourceCount} inputs · {outputCount} outputs
          </span>
        )}
        <div className={GROUP_END}>
          {notice && (
            <span className="sc-error" role="alert">
              {notice}
            </span>
          )}
          {/* D62: nothing is saved while a history version is shown. */}
          {!props.history.previewing && (
            <span className={saveClass(saveState)} role="status">
              <span className={saveDotClass(saveState)} aria-hidden="true" />
              <span className={SAVE_LONG}>{STATE_LABEL[saveState]}</span>
              <span className={SAVE_SHORT} aria-hidden="true">
                {SHORT_LABEL[saveState]}
              </span>
              {saveState === 'conflict' && (
                <button type="button" className={SAVE_BUTTON} onClick={props.onReload}>
                  Reload latest
                </button>
              )}
            </span>
          )}
          {screen === 'phone' ? (
            <button type="button" className={ICON} aria-label="More" aria-haspopup="menu" title="More" onClick={(e) => openMore(e.currentTarget)}>
              <Icon name="more" />
            </button>
          ) : (
          <>
          <span className={SEP} aria-hidden="true" />
          {/* U2: the team's fonts and library under one Assets menu; History, Review and the theme as icons. */}
          <button type="button" className={GHOST} aria-haspopup="menu" onClick={(e) => openAssets(e.currentTarget)} title="Team fonts and library">
            <Icon name="library" /> Assets
          </button>
          <button type="button" className={ICON} onClick={openHistory} aria-label="History" aria-pressed={props.history.open} title="History: earlier versions of this project">
            <Icon name="history" />
          </button>
          <button type="button" className={`${ICON} sc-topbar__review relative`} onClick={openReview} aria-label="Review" aria-pressed={reviewOpen} title="Review: approval and comments on every Preview">
            <Icon name="check" />
            {openComments > 0 && <span className={COUNT} aria-hidden="true">{openComments}</span>}
          </button>
          <button
            type="button"
            className={`${ICON} sc-theme-toggle`}
            onClick={toggleTheme}
            aria-label="Dark theme"
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {!floating && (
            <button type="button" className={ICON} onClick={() => setInspectorHidden(!inspectorHidden)} aria-label="Side panel" aria-pressed={!inspectorHidden} title={inspectorHidden ? 'Show the side panel' : 'Hide the side panel'}>
              <Icon name="panel" />
            </button>
          )}
          </>
          )}
          {!readOnly && (
            <button
              type="button"
              className={PRIMARY}
              aria-label="Export"
              onClick={() => void autosave.flush().then(() => setExporting({}))}
              disabled={outputCount === 0}
              title={outputCount === 0 ? 'Add a Preview first' : 'Export Previews'}
            >
              <Icon name="export" /> Export
            </button>
          )}
        </div>
      </header>
      {props.history.previewing && (
        <div className="sc-board__version" role="status">
          <span>
            <strong>Version from {versionWhen(props.history.previewing)}</strong>
            {` · ${versionTitle(props.history.previewing)}`}
            {props.history.previewing.by ? ` · ${props.history.previewing.by}` : ''}
          </span>
          {props.history.error && <span className="sc-error">{props.history.error}</span>}
          <span className="sc-board__version-actions">
            {props.canEdit && (
              <button type="button" className="sc-board__restore" onClick={() => void props.history.restore()}>
                Restore
              </button>
            )}
            <button type="button" onClick={props.history.close}>
              Close
            </button>
          </span>
        </div>
      )}
      <div
        className="sc-board__canvas"
        // A file dropped outside an input must not make the browser open it (and leave the board).
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            // D40: pictures dropped on the empty canvas make an Assets card there.
            if (!readOnly && flow.current && (e.target as HTMLElement).closest('.react-flow__pane')) {
              const at = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              const files = Array.from(e.dataTransfer.files);
              setNotice(`Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'}…`);
              void uploadPictures(teamId, files, remember).then(({ pictures, problems }) => {
                if (pictures.length) run((d) => addPictures(d, pictures, { at }));
                setNotice(problems.length ? problems.join(' ') : null);
              });
            }
          }
        }}
      >
        <BoardContext.Provider value={actions}>
          <div className={`sc-board__flow${activeTool === 'hand' ? ' sc-board__flow--hand' : ''}${tidying ? ' sc-board__flow--tidying' : ''}`} ref={flowEl} onContextMenuCapture={onPortContextMenu}>
          <ReactFlow
            nodes={flowNodes}
            edges={displayEdges}
            edgeTypes={edgeTypes}
            onEdgeDoubleClick={onEdgeDoubleClick}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onSelectionEnd={onSelectionEnd}
            onPaneContextMenu={onPaneContextMenu}
            colorMode={theme}
            onSelectionChange={({ nodes: picked }) => setSelectedNode(picked.length === 1 ? (picked[0]?.id ?? null) : null)}
            onMove={(_, vp) => {
              setFarZoom(vp.zoom < FAR_ZOOM);
              zoomChanged(vp.zoom);
            }}
            onInit={(instance) => {
              flow.current = instance;
              zoomChanged(instance.getZoom());
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
            // Hand moves the board only: panels don't move or get selected, a drag anywhere pans.
            nodesDraggable={!readOnly && activeTool === 'select'}
            elementsSelectable={activeTool === 'select'}
            // Shift-click (or Ctrl / ⌘-click) adds a panel to the selection or takes it out; Shift-drag adds a box.
            multiSelectionKeyCode={MULTI_SELECT_KEYS}
            nodesConnectable={!readOnly}
            edgesFocusable={!readOnly}
            deleteKeyCode={null}
            fitView
            fitViewOptions={FIT_OPTIONS}
            // T13.5: Figma-style — wheel pans, Ctrl/⌘ + wheel or pinch zooms; drag empty canvas to select (Hand / Space to pan).
            panOnScroll
            zoomOnScroll={false}
            selectionOnDrag={activeTool === 'select' && !readOnly && (!coarse || several)}
            // Select: the middle mouse button pans. D58, touch: one finger moves the board (on empty canvas and on
            // panels not selected), two fingers pinch and pan (usePinch); with Select several one finger draws a box
            // (React Flow starts a touch box only when finger panning is off).
            panOnDrag={activeTool === 'hand' || readOnly ? true : coarse ? !several : [1]}
            // D58, touch: a card's buttons and fields don't stop the board moving; ports, drag grips and a selected
            // panel (React Flow marks those with this class) do.
            noPanClassName={coarse ? TOUCH_NO_PAN : 'nopan'}
            // A tap that wobbles a few px is still a tap, not a move.
            nodeDragThreshold={coarse ? 4 : 1}
            snapToGrid={grid && !altHeld}
            snapGrid={[16, 16]}
            minZoom={ZOOM_LIMITS.min}
            maxZoom={ZOOM_LIMITS.max}
            proOptions={{ hideAttribution: false }}
          >
            {/* D57: the dots show the grid's state — every 16 px and stronger while panels snap to it, faint every 32 px when not. */}
            <Background gap={grid ? 16 : 32} size={grid ? 1.6 : 1} color={grid ? 'var(--muted)' : undefined} className={grid ? 'sc-bg sc-bg--grid' : 'sc-bg'} />
            {/* The minimap needs a desktop-sized canvas; on tablets and phones it would cover the work. */}
            {minimap && screen === 'desktop' && <MiniMap pannable zoomable position="bottom-right" />}
            <CanvasToolbar
              tool={activeTool}
              onTool={setTool}
              grid={grid}
              onGrid={setGrid}
              minimap={minimap}
              onMinimap={setMinimap}
              panels={
                floating && {
                  open: panel,
                  onOpen: (p) => {
                    if (p && props.history.open) closeHistory();
                    if (p) setReviewOpen(false);
                    setPanel(p);
                  },
                  library: false,
                }
              }
              compact={screen === 'phone'}
              minimapToggle={screen === 'desktop'}
              onTidy={readOnly ? undefined : tidy}
              tidySelection={selectedCount >= 2}
              several={coarse && !readOnly ? { on: several, onToggle: () => setSeveral((on) => !on) } : undefined}
            />
            {coarse && <MultiSelect on={several} />}
            {!readOnly && activeTool === 'select' && (selectedCount >= 2 || several) && (
              <Panel position="top-center" className="sc-selbar nodrag nopan nowheel" aria-label="Selection" role="toolbar">
                <span className="sc-selbar__count">{selectedCount} selected</span>
                <button type="button" className="sc-btn" onClick={groupSelection} disabled={selectedCount < 2} title="Group the selected panels (Ctrl/⌘ + G)">
                  Group
                </button>
                <button type="button" className="sc-btn sc-btn--danger" onClick={deleteSelection} disabled={selectedCount === 0} title="Delete the selected panels (Delete)">
                  <Icon name="trash" /> Delete
                </button>
                <button type="button" className="sc-icon-btn" aria-label="Clear selection" title="Clear selection (Esc)" onClick={clearSelection}>
                  <Icon name="close" />
                </button>
                {several && (
                  <button type="button" className="sc-btn sc-btn--primary" onClick={() => setSeveral(false)}>
                    Done
                  </button>
                )}
              </Panel>
            )}
            {zoomedOut && <ZoomLabels nodes={flowNodes} doc={doc} approvals={approvals} openComments={openCommentCounts} />}
            <ViewportPortal>
              {guides.vertical !== undefined && <div className="sc-guide sc-guide--v" style={{ transform: `translateX(${guides.vertical}px)` }} />}
              {guides.horizontal !== undefined && <div className="sc-guide sc-guide--h" style={{ transform: `translateY(${guides.horizontal}px)` }} />}
            </ViewportPortal>
            {toast && (
              <Panel position="bottom-center" className="sc-board__toast nodrag nopan" role="status">
                <span>{toast}</span>
                {/already tidy$/.test(toast) ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      undo();
                      setToast(null);
                    }}
                  >
                    Undo
                  </button>
                )}
              </Panel>
            )}
            <BoardKeys
              onTool={setTool}
              onDelete={readOnly ? undefined : deleteSelection}
              onClear={clearSelection}
              onSelectAll={selectAll}
              onNudge={nudge}
              onSpace={setSpaceHeld}
              onTidy={readOnly ? undefined : tidy}
              disabled={Boolean(editingMain || editingOutput)}
            />
          </ReactFlow>
          </div>
          {props.history.open ? (
            <HistoryPanel
              url={url}
              readOnly={!props.canEdit}
              previewing={props.history.previewing?.id ?? null}
              refresh={props.historyRefresh}
              floating={floating}
              onView={(v) => void props.history.view(v)}
              flush={props.history.flush}
              onClose={closeHistory}
            />
          ) : reviewOpen ? (
            <ReviewPanel floating={floating} onClose={() => setReviewOpen(false)} />
          ) : (
            ((!floating && !inspectorHidden) || panel === 'inspector') && (
              <Inspector selected={selectedNode} floating={floating} onClose={() => setPanel(null)} onHide={floating ? undefined : () => setInspectorHidden(true)} />
            )
          )}
          {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
          {editingMain && <MainEditor compositionId={editingMain} onClose={() => setEditingMain(null)} />}
          {editingOutput && <OutputEditor outputId={editingOutput} comments={outputComments} onClose={() => setEditingOutput(null)} />}
        </BoardContext.Provider>
      </div>
      {reconnecting && (
        <ReconnectDialog
          label={doc.outputs.find((o) => o.id === reconnecting.outputId)?.label ?? 'Preview'}
          overrides={doc.outputs.find((o) => o.id === reconnecting.outputId)?.overrides.length ?? 0}
          onChoose={(choice) => {
            run((d) => reconnectOutput(d, reconnecting.outputId, choice, reconnecting.compositionId));
            setReconnecting(null);
          }}
          onClose={() => setReconnecting(null)}
        />
      )}
      {showLibrary && <LibraryDialog teamId={teamId} readOnly={readOnly} sourceCount={sourceCount} run={run} onClose={() => setShowLibrary(false)} />}
      {exporting && <ExportDialog teamId={teamId} projectId={projectId} doc={doc} layoutDeps={layoutDeps} approvals={approvals} initialOutputs={exporting.outputs} presetSet={exporting.set} onClose={() => setExporting(false)} />}
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

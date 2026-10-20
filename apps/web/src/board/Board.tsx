import {
  addOutput,
  addSource,
  connectSource,
  deleteSource,
  disconnectOutput,
  disconnectSource,
  duplicateSource,
  isOutputConnected,
  LIMITS,
  reconnectNeedsChoice,
  reconnectOutput,
  setSourceVisible, type InputSource, type ProjectDoc, type SizePreset, type SourceError, type SourceResult } from '@smart-canvas/core';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
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
import { ContextMenu, type MenuState } from './ContextMenu';
import { ExportDialog } from './ExportDialog';
import { confirmDelete } from './LayerRow';
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
  isInputToMain,
  isMainToOutput,
  MAIN_ID,
  outputIdOfNode,
  portFromHandle,
  sourceIdOfNode,
  syncNodes,
  withPositions,
  type BoardNode,
} from './flow';
import { nodeTypes } from './nodes';

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
  const [editingMain, setEditingMain] = useState(false);
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
  const [placeAt, setPlaceAt] = useState<{ x: number; y: number } | null>(null);
  const flow = useRef<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const [outputCount, setOutputCount] = useState(initial.doc.outputs.length);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
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

  const onNodesChange = useCallback((changes: NodeChange<BoardNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, []);

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
  const layoutDeps = useLayoutDeps(doc, sizes, teamFonts.map((f) => f.id).join(','));

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
  const reconnect = useCallback(
    (outputId: string) => {
      if (reconnectNeedsChoice(docRef.current, outputId)) setReconnecting(outputId);
      else run((d) => reconnectOutput(d, outputId, 'keep'));
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
      openMainEditor: () => setEditingMain(true),
      openOutputEditor: (id: string) => setEditingOutput(id),
      author,
      teamFonts,
      sourceCount,
      // Typing in one input's field is one undo step (coalesced by key).
      editSource: (id: string, edit: (s: InputSource) => InputSource) => apply(withSource(docRef.current, id, edit), `source:${id}`),
      layoutDeps,
      presets,
      rememberAsset: remember,
      disconnectOutput: disconnect,
      reconnectOutput: reconnect,
      run,
    }),
    [teamId, readOnly, doc, teamFonts, sourceCount, layoutDeps, presets, remember, disconnect, reconnect, author, apply, run],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (c) => !readOnly && (isInputToMain(c) || (isMainToOutput(c) && !isOutputConnected(docRef.current, outputIdOfNode(c.target) ?? ''))),
    [readOnly],
  );

  /** Wire input → a port row: connects it, and moves it to that port if different (D11). */
  const onConnect = useCallback(
    (c: Connection) => {
      const outputId = isMainToOutput(c) ? outputIdOfNode(c.target) : undefined;
      if (outputId) {
        reconnect(outputId);
        return;
      }
      const sourceId = sourceIdOfNode(c.source);
      if (!sourceId || !isInputToMain(c)) return;
      run((doc) => connectSource(doc, sourceId, portFromHandle(c.targetHandle)));
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
        const outputId = e.source === MAIN_ID ? outputIdOfNode(e.target) : undefined;
        if (sourceId) run((doc) => disconnectSource(doc, sourceId));
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
  const onReconnectStart = useCallback(() => {
    reconnectDone.current = false;
  }, []);
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      reconnectDone.current = true;
      const oldSource = sourceIdOfNode(old.source);
      const newSource = sourceIdOfNode(c.source);
      if (oldSource && newSource && isInputToMain(c)) {
        // Same input to another row = move it to that port; another input onto this row = swap who feeds it.
        const port = portFromHandle(c.targetHandle);
        run((doc) => {
          const freed = newSource === oldSource ? { ok: true as const, doc } : disconnectSource(doc, oldSource);
          return freed.ok ? connectSource(freed.doc, newSource, port) : freed;
        });
        return;
      }
      const oldOutput = old.source === MAIN_ID ? outputIdOfNode(old.target) : undefined;
      const newOutput = isMainToOutput(c) ? outputIdOfNode(c.target) : undefined;
      if (oldOutput && newOutput && oldOutput !== newOutput) {
        disconnect(oldOutput);
        reconnect(newOutput);
      }
    },
    [run, disconnect, reconnect],
  );
  const onReconnectEnd = useCallback(
    (_e: MouseEvent | TouchEvent, edge: Edge, _type: HandleType, state: FinalConnectionState) => {
      if (!reconnectDone.current && !state.toHandle) onEdgesDelete([edge]);
    },
    [onEdgesDelete],
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

  // T8.4: right-click the empty canvas → add an input or an output right there.
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
        quick('Image input', { kind: 'image', label: 'Image', behavesLike: 'decoration' }),
        quick('Logo / SVG input', { kind: 'vector', label: 'Logo', behavesLike: 'logo' }),
        quick('Text input', { kind: 'text', label: 'Text', behavesLike: 'text' }),
        quick('Colour / gradient input', { kind: 'fill', label: 'Colour', behavesLike: 'decoration' }),
        {
          label: 'Input…',
          disabled: inputsFull,
          onSelect: () => {
            setPlaceAt(at);
            setAdding(true);
          },
        },
        {
          label: outputsFull ? `Output… (${LIMITS.maxOutputs} max)` : 'Output…',
          disabled: outputsFull,
          separated: true,
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
      const doc = withPositions(docRef.current, dragged);
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
      <header className="sc-board__bar">
        <button type="button" onClick={props.onBack}>
          ← Projects
        </button>
        <strong>{initial.doc.name}</strong>
        {readOnly && <span className="sc-badge">View only</span>}
        {!readOnly && (
          <>
            <button type="button" onClick={undo} disabled={!canStep.undo} aria-label="Undo" title="Undo (Ctrl/⌘+Z)">
              ↶
            </button>
            <button type="button" onClick={redo} disabled={!canStep.redo} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)">
              ↷
            </button>
          </>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setPlaceAt(null);
              setAdding(true);
            }}
            disabled={sourceCount >= LIMITS.maxSources}
            title={sourceCount >= LIMITS.maxSources ? `${LIMITS.maxSources} inputs max` : undefined}
          >
            + Add input
          </button>
        )}
        <span className="sc-muted">
          {sourceCount}/{LIMITS.maxSources} inputs
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setPlaceAt(null);
              setAddingOutput(true);
            }}
            disabled={outputCount >= LIMITS.maxOutputs}
            title={outputCount >= LIMITS.maxOutputs ? `${LIMITS.maxOutputs} outputs max` : undefined}
          >
            + Add output
          </button>
        )}
        <span className="sc-muted">
          {outputCount}/{LIMITS.maxOutputs} outputs
        </span>
        <button type="button" onClick={() => setShowFonts(true)}>
          Fonts
        </button>
        <button type="button" onClick={() => setShowLibrary(true)}>
          Library
        </button>
        {!readOnly && (
          <button type="button" onClick={() => void autosave.flush().then(() => setExporting(true))} disabled={outputCount === 0}>
            Export
          </button>
        )}
        {notice && (
          <span className="sc-error" role="alert">
            {notice}
          </span>
        )}
        <span className={`sc-save sc-save--${saveState}`} role="status">
          {STATE_LABEL[saveState]}
          {saveState === 'conflict' && (
            <button type="button" onClick={props.onReload}>
              Reload latest
            </button>
          )}
        </span>
      </header>
      <div
        className="sc-board__canvas"
        // A file dropped outside an input must not make the browser open it (and leave the board).
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      >
        <BoardContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
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
            reconnectRadius={16}
            connectionRadius={36}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesFocusable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
          {editingMain && <MainEditor onClose={() => setEditingMain(false)} />}
          {editingOutput && <OutputEditor outputId={editingOutput} onClose={() => setEditingOutput(null)} />}
        </BoardContext.Provider>
      </div>
      {adding && <AddInputDialog onAdd={(input) => addInput(input)} onClose={() => setAdding(false)} />}
      {reconnecting && (
        <ReconnectDialog
          label={doc.outputs.find((o) => o.id === reconnecting)?.label ?? 'output'}
          overrides={doc.outputs.find((o) => o.id === reconnecting)?.overrides.length ?? 0}
          onChoose={(choice) => {
            run((d) => reconnectOutput(d, reconnecting, choice));
            setReconnecting(null);
          }}
          onClose={() => setReconnecting(null)}
        />
      )}
      {showLibrary && <LibraryDialog teamId={teamId} readOnly={readOnly} sourceCount={sourceCount} run={run} onClose={() => setShowLibrary(false)} />}
      {exporting && <ExportDialog teamId={teamId} projectId={projectId} doc={doc} onClose={() => setExporting(false)} />}
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

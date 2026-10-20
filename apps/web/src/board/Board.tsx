import {
  addOutput,
  addSource,
  connectSource,
  disconnectOutput,
  disconnectSource,
  isOutputConnected,
  LIMITS,
  reconnectNeedsChoice,
  reconnectOutput, type InputSource, type ProjectDoc, type SizePreset, type SourceError, type SourceResult } from '@smart-canvas/core';
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
  type IsValidConnection,
  type Node,
  type NodeChange,
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
import { ExportDialog } from './ExportDialog';
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
  const [edges, setEdges] = useState(() => docToEdges(initial.doc));
  const [sourceCount, setSourceCount] = useState(initial.doc.sources.length);
  const [adding, setAdding] = useState(false);
  const [addingOutput, setAddingOutput] = useState(false);
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

  /** The single way the doc changes from the UI: board state follows, autosave picks it up. */
  const apply = useCallback(
    (doc: ProjectDoc) => {
      if (readOnly || doc === docRef.current) return;
      docRef.current = doc;
      setDoc(doc);
      setNodes((ns) => syncNodes(ns, docToNodes(doc)));
      setEdges(docToEdges(doc));
      setSourceCount(doc.sources.length);
      setOutputCount(doc.outputs.length);
      autosave.change(doc);
    },
    [readOnly, autosave],
  );

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
      editSource: (id: string, edit: (s: InputSource) => InputSource) => apply(withSource(docRef.current, id, edit)),
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

  const addInput = (input: NewInput) => {
    const result = run((doc) => addSource(doc, { id: newId(), ...input }));
    if (result.ok) setAdding(false);
  };

  const addOutputNode = (o: NewOutput) => {
    const result = run((doc) => addOutput(doc, { id: newId(), ...o }));
    if (result.ok) setAddingOutput(false);
  };

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, dragged: Node[]) => {
      const doc = withPositions(docRef.current, dragged);
      if (doc === docRef.current) return;
      docRef.current = doc;
      setDoc(doc);
      autosave.change(doc);
    },
    [autosave],
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
          <button
            type="button"
            onClick={() => setAdding(true)}
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
            onClick={() => setAddingOutput(true)}
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
      <div className="sc-board__canvas">
        <BoardContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            isValidConnection={isValidConnection}
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
          {editingMain && <MainEditor onClose={() => setEditingMain(false)} />}
          {editingOutput && <OutputEditor outputId={editingOutput} onClose={() => setEditingOutput(null)} />}
        </BoardContext.Provider>
      </div>
      {adding && <AddInputDialog onAdd={addInput} onClose={() => setAdding(false)} />}
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

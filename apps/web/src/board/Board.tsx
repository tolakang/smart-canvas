import { addSource, connectSource, disconnectSource, LIMITS, type InputSource, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
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
import { AddInputDialog, type NewInput } from './AddInputDialog';
import { BoardContext, type BoardActions } from './context';
import { newId } from './ids';
import { withSource } from './content';
import {
  docToEdges,
  docToNodes,
  isInputToMain,
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

const STATE_LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Save failed, retrying…',
  conflict: 'Someone else saved a newer version.',
};

export function Board(props: { teamId: string; projectId: string; readOnly: boolean; onBack: () => void }) {
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
  url: string;
  initial: Loaded;
  readOnly: boolean;
  onBack: () => void;
  onReload: () => void;
}) {
  const { teamId, url, initial, readOnly } = props;
  const docRef = useRef(initial.doc);
  const [nodes, setNodes] = useState<BoardNode[]>(() => docToNodes(initial.doc));
  const [edges, setEdges] = useState(() => docToEdges(initial.doc));
  const [sourceCount, setSourceCount] = useState(initial.doc.sources.length);
  const [adding, setAdding] = useState(false);
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
      setNodes((ns) => syncNodes(ns, docToNodes(doc)));
      setEdges(docToEdges(doc));
      setSourceCount(doc.sources.length);
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
        setNotice(result.error === 'limit' ? `A project can have at most ${LIMITS.maxSources} inputs.` : 'That change could not be made.');
      }
      return result;
    },
    [apply],
  );

  const actions = useMemo<BoardActions>(
    () => ({
      teamId,
      readOnly,
      sourceCount,
      editSource: (id: string, edit: (s: InputSource) => InputSource) => apply(withSource(docRef.current, id, edit)),
      run,
    }),
    [teamId, readOnly, sourceCount, apply, run],
  );

  const isValidConnection = useCallback<IsValidConnection>((c) => !readOnly && isInputToMain(c), [readOnly]);

  /** Wire input → a port row: connects it, and moves it to that port if different (D11). */
  const onConnect = useCallback(
    (c: Connection) => {
      const sourceId = sourceIdOfNode(c.source);
      if (!sourceId || !isInputToMain(c)) return;
      run((doc) => connectSource(doc, sourceId, portFromHandle(c.targetHandle)));
    },
    [run],
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
        if (sourceId) run((doc) => disconnectSource(doc, sourceId));
      }
    },
    [run],
  );

  const addInput = (input: NewInput) => {
    const result = run((doc) => addSource(doc, { id: newId(), ...input }));
    if (result.ok) setAdding(false);
  };

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, dragged: Node[]) => {
      const doc = withPositions(docRef.current, dragged);
      if (doc === docRef.current) return;
      docRef.current = doc;
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
        </BoardContext.Provider>
      </div>
      {adding && <AddInputDialog onAdd={addInput} onClose={() => setAdding(false)} />}
    </div>
  );
}

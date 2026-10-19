import type { ProjectDoc } from '@smart-canvas/core';
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Autosave, type SaveState } from './autosave';
import { docToEdges, docToNodes, withPositions, type BoardNode } from './flow';
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
      url={url}
      initial={result.ok}
      readOnly={readOnly}
      onBack={props.onBack}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}

function BoardCanvas(props: { url: string; initial: Loaded; readOnly: boolean; onBack: () => void; onReload: () => void }) {
  const { url, initial, readOnly } = props;
  const docRef = useRef(initial.doc);
  const [nodes, setNodes] = useState<BoardNode[]>(() => docToNodes(initial.doc));
  const edges = useMemo(() => docToEdges(initial.doc), [initial.doc]);
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          nodesDraggable={!readOnly}
          nodesConnectable={false}
          deleteKeyCode={null}
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
      </div>
    </div>
  );
}

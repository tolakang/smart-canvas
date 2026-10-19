import { connectSource, disconnectSource, moveSourceToPort } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useState, type DragEvent } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import { OUTPUT_HANDLE, portHandleId, type MainFlowNode } from './flow';

const NO_CANVAS = 'nodrag nopan nowheel';
const DRAG_TYPE = 'application/x-sc-source';

/**
 * The main preview node: a port list (port 0 = front, D11). Wire an input onto a row to connect it
 * there; drag rows or use ▲▼ to re-order; × disconnects.
 */
export function MainNodeView({ id, data }: NodeProps<MainFlowNode>) {
  const { readOnly, run, teamId, openMainEditor } = useBoard();
  const updateInternals = useUpdateNodeInternals();
  const [dropAt, setDropAt] = useState<number | null>(null);
  const handleKey = data.ports.map((p) => p.port).join(',');

  // Handles are added/removed with the port list; React Flow must re-measure them.
  useEffect(() => updateInternals(id), [id, handleKey, updateInternals]);

  const onDrop = (e: DragEvent, port: number) => {
    e.preventDefault();
    setDropAt(null);
    const sourceId = e.dataTransfer.getData(DRAG_TYPE);
    if (sourceId) run((doc) => moveSourceToPort(doc, sourceId, port));
  };

  return (
    <div className="sc-node sc-node--main">
      <div className="sc-node__head">
        <div className="sc-node__title">Main preview</div>
        <button type="button" className={`sc-open-editor ${NO_CANVAS}`} onClick={openMainEditor}>
          {readOnly ? 'View' : 'Edit'}
        </button>
      </div>
      <div className="sc-node__meta">
        {data.size.width} × {data.size.height} {data.size.unit} · {data.inputs} inputs · {data.outputs} outputs
      </div>
      <div className="sc-main-thumb" aria-label="Main preview">
        <RenderThumbnail
          scene={data.scene}
          sources={data.sources}
          assetUrl={(assetId) => assetUrl(teamId, assetId)}
          maxWidth={236}
          maxHeight={180}
        />
      </div>
      <ol className="sc-ports" aria-label="Ports (front first)">
        {data.ports.map((p, i) => (
          <li
            key={p.sourceId}
            className={`sc-port${p.connected ? ' sc-port--wired' : ''}${p.visible ? '' : ' sc-port--hidden'}${dropAt === p.port ? ' sc-port--drop' : ''}`}
            data-port={p.port}
            draggable={!readOnly}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, p.sourceId);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (readOnly || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              setDropAt(p.port);
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => onDrop(e, p.port)}
          >
            <Handle type="target" position={Position.Left} id={portHandleId(p.port)} isConnectable={!readOnly} />
            <span className="sc-port__n">{p.port}</span>
            <span className={`sc-port__label ${readOnly ? '' : NO_CANVAS}`} title={p.connected ? 'Wired' : 'Not wired'}>
              {p.connected ? '●' : '○'} {p.label}
            </span>
            {!readOnly && (
              <span className={`sc-port__actions ${NO_CANVAS}`}>
                <button type="button" aria-label={`Move ${p.label} forward`} disabled={i === 0} onClick={() => run((doc) => moveSourceToPort(doc, p.sourceId, p.port - 1))}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${p.label} back`}
                  disabled={i === data.ports.length - 1}
                  onClick={() => run((doc) => moveSourceToPort(doc, p.sourceId, p.port + 1))}
                >
                  ▼
                </button>
                {p.connected ? (
                  <button type="button" aria-label={`Disconnect ${p.label}`} onClick={() => run((doc) => disconnectSource(doc, p.sourceId))}>
                    ×
                  </button>
                ) : (
                  <button type="button" aria-label={`Connect ${p.label}`} onClick={() => run((doc) => connectSource(doc, p.sourceId))}>
                    +
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {data.ports.length === 0 && <p className="sc-node__meta">No inputs yet.</p>}
      <div className="sc-node__meta sc-ports__hint">front ↑ · back ↓</div>
      <Handle type="source" position={Position.Right} id={OUTPUT_HANDLE} isConnectable={!readOnly} />
    </div>
  );
}

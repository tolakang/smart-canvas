import { connectSource, disconnectSource } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import { OUTPUT_HANDLE, portHandleId, type MainFlowNode } from './flow';
import { Icon, LayerActions, LayerThumb, useLayerReorder } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

/**
 * The main preview node: a layer list, one row per port (port 0 = front = top, D11). Wire an input onto a
 * row to connect it there; drag a row to re-order (T8.1); the dot connects / disconnects; + duplicates.
 */
export function MainNodeView({ id, data }: NodeProps<MainFlowNode>) {
  const { readOnly, run, teamId, openMainEditor } = useBoard();
  const updateInternals = useUpdateNodeInternals();
  const { dropAt, rowProps } = useLayerReorder();
  const handleKey = data.ports.map((p) => p.port).join(',');
  const sourceOf = new Map(data.sources.map((s) => [s.id, s]));

  // Handles are added/removed with the port list; React Flow must re-measure them.
  useEffect(() => updateInternals(id), [id, handleKey, updateInternals]);

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
      <ol className="sc-ports" aria-label="Layers (front first)">
        {data.ports.map((p) => {
          const source = sourceOf.get(p.sourceId);
          return (
            <li
              key={p.sourceId}
              className={`sc-port${p.connected ? ' sc-port--wired' : ''}${p.visible ? '' : ' sc-port--hidden'}${dropAt === p.port ? ' sc-port--drop' : ''} ${readOnly ? '' : NO_CANVAS}`}
              data-port={p.port}
              {...rowProps({ id: p.sourceId, port: p.port })}
            >
              <Handle type="target" position={Position.Left} id={portHandleId(p.port)} isConnectable={!readOnly} />
              {!readOnly && (
                <span className="sc-port__grip" title="Drag to re-order">
                  <Icon name="grip" />
                </span>
              )}
              {source && <LayerThumb source={source} />}
              <button
                type="button"
                className="sc-port__dot"
                disabled={readOnly}
                aria-label={`${p.connected ? 'Disconnect' : 'Connect'} ${p.label}`}
                title={p.connected ? 'Wired: click to disconnect' : 'Not wired: click to connect'}
                onClick={() => run((doc) => (p.connected ? disconnectSource(doc, p.sourceId) : connectSource(doc, p.sourceId)))}
              >
                {p.connected ? '●' : '○'}
              </button>
              <span className="sc-port__label">{p.label}</span>
              {!readOnly && source && (
                <span className="sc-port__actions">
                  <LayerActions source={source} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {data.ports.length === 0 && <p className="sc-node__meta">No inputs yet.</p>}
      <div className="sc-node__meta sc-ports__hint">Top = front · drag to re-order</div>
      <Handle type="source" position={Position.Right} id={OUTPUT_HANDLE} isConnectable={!readOnly} />
    </div>
  );
}

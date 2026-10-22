import { canvasMetrics, compositionHealth, LAYER_GROUP_LABEL, languagePairs, layerGroup, connectSource, deleteComposition, disconnectSource, guideFor, outputComposition, renameComposition } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import { LAYER_OUT_HANDLE, MAIN_ID, OUTPUT_HANDLE, portHandleId, type MainFlowNode } from './flow';
import { HealthBadge } from './HealthBadge';
import { Icon, LayerActions, LayerThumb, useLayerReorder } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

/**
 * A composition ("master preview") node: a layer list, one row per port (port 0 = front = top, D11). Wire an input
 * onto a row to connect it there; drag a row to re-order (T8.1); the dot connects / disconnects; + duplicates.
 * T12.3: any number of them. Others than 'main' can be renamed (double-click) and deleted, list only the inputs
 * wired into them, and end with a drop row that takes a new input.
 */
export function MainNodeView({ id, data }: NodeProps<MainFlowNode>) {
  const { readOnly, run, teamId, openMainEditor, doc, missingFonts, layoutDeps } = useBoard();
  const { compositionId } = data;
  const isMain = compositionId === MAIN_ID;
  const health = useMemo(() => compositionHealth(doc, compositionId, missingFonts), [doc, compositionId, missingFonts]);
  // D42: a guide names its master and counts the outputs whose shape picks it.
  const comp = doc.compositions.find((c) => c.id === compositionId);
  const guideOf = comp?.guide ? (doc.compositions.find((c) => c.id === comp.guide?.of)?.label ?? null) : null;
  const usedBy = useMemo(() => {
    const master = comp?.guide?.of;
    return master ? doc.outputs.filter((o) => outputComposition(doc, o.id) === master && guideFor(doc, master, canvasMetrics(o).trim)?.id === comp?.id).length : 0;
  }, [doc, comp]);
  const updateInternals = useUpdateNodeInternals();
  const { dropAt, rowProps } = useLayerReorder(compositionId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== data.label) run((d) => renameComposition(d, compositionId, name));
  };
  const handleKey = `${data.ports.map((p) => p.port).join(',')}|${data.ports.length}`;
  const sourceOf = new Map(data.sources.map((s) => [s.id, s]));
  const headlinePictures = useMemo(() => new Set(languagePairs(doc).flatMap((p) => [p.km, p.en])), [doc]);

  // Handles are added/removed with the port list; React Flow must re-measure them.
  useEffect(() => updateInternals(id), [id, handleKey, updateInternals]);

  return (
    <div className="sc-node sc-node--main">
      <div className="sc-node__head">
        {renaming !== null ? (
          <input
            className={`sc-rename ${NO_CANVAS}`}
            aria-label="Master preview name"
            value={renaming}
            autoFocus
            maxLength={200}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <div className="sc-node__title" title={isMain || readOnly ? data.label : `${data.label} — double-click to rename`} onDoubleClick={() => !isMain && !readOnly && setRenaming(data.label)}>
            {data.label}
          </div>
        )}
        <HealthBadge health={health} />
        <button type="button" className={`sc-open-editor ${NO_CANVAS}`} onClick={() => openMainEditor(compositionId)} aria-label={`${readOnly ? 'View' : 'Edit'} ${data.label}`}>
          {readOnly ? 'View' : 'Edit'}
        </button>
        {!isMain && !readOnly && (
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`Delete ${data.label}`}
            title="Delete this master preview (its outputs keep their current layout, disconnected)"
            onClick={() => window.confirm(`Delete “${data.label}”? Outputs wired to it are disconnected and keep their current layout.`) && run((d) => deleteComposition(d, compositionId, layoutDeps ?? undefined))}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="sc-node__meta">
        {guideOf ? (
          <>
            <span className="sc-chip" title={`Outputs of “${guideOf}” shaped like this take their layout from it (D42)`}>Guide</span> {data.size.width} × {data.size.height} {data.size.unit} · {usedBy} {usedBy === 1 ? 'output uses' : 'outputs use'} it
          </>
        ) : (
          <>
            {data.size.width} × {data.size.height} {data.size.unit} · {data.ports.length} layers · {data.outputs} outputs
          </>
        )}
      </div>
      <div className="sc-main-thumb" aria-label={isMain ? 'Master preview' : `${data.label} preview`}>
        <RenderThumbnail
          scene={data.scene}
          sources={data.sources}
          assetSizes={layoutDeps?.assets}
          assetUrl={(assetId) => assetUrl(teamId, assetId)}
          maxWidth={236}
          maxHeight={180}
        />
      </div>
      <ol className="sc-ports" aria-label="Layers (front first)">
        {data.ports.map((p, i) => {
          const source = sourceOf.get(p.sourceId);
          // D45: a small label where each layer comp group (logo, headline, elements, background) starts.
          const group = source ? layerGroup(source, headlinePictures) : 'elements';
          const prev = i > 0 ? sourceOf.get(data.ports[i - 1]?.sourceId ?? '') : undefined;
          const starts = i === 0 || !prev || layerGroup(prev, headlinePictures) !== group;
          return (
            <li
              key={p.sourceId}
              data-group={group}
              {...(starts ? { 'data-group-label': LAYER_GROUP_LABEL[group] } : {})}
              className={`sc-port${starts ? ' sc-port--group-start' : ''}${p.connected ? ' sc-port--wired' : ''}${p.visible ? '' : ' sc-port--hidden'}${dropAt === p.port ? ' sc-port--drop' : ''} ${readOnly ? '' : NO_CANVAS}`}
              data-port={p.port}
              {...rowProps({ id: p.sourceId, port: p.port })}
            >
              <Handle type="target" position={Position.Left} id={portHandleId(p.port)} isConnectable={!readOnly} className="sc-handle--layer" title="Layer in" />
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
                onClick={() => run((doc) => (p.connected ? disconnectSource(doc, p.sourceId, compositionId) : connectSource(doc, p.sourceId, undefined, compositionId)))}
              >
                {p.connected ? '●' : '○'}
              </button>
              <span className="sc-port__label">{p.label}</span>
              {!readOnly && source && (
                <span className="sc-port__actions">
                  <LayerActions source={source} compositionId={compositionId} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        // A row past the last one: an input (or a process, T12.5) wired here becomes this preview's back row.
        <div className="sc-port sc-port--add" data-port={data.ports.length}>
          <Handle type="target" position={Position.Left} id={portHandleId(data.ports.length)} isConnectable className="sc-handle--layer" title="Layer in: wire an input or a process here" />
          <span className="sc-port__hint">{isMain ? 'Wire a process here' : 'Wire an input here'}</span>
        </div>
      )}
      {data.ports.length === 0 && isMain && <p className="sc-node__meta">No inputs yet.</p>}
      <div className="sc-node__meta sc-ports__hint">Top = front · drag to re-order</div>
      <Handle type="source" position={Position.Right} id={OUTPUT_HANDLE} isConnectable={!readOnly} className="sc-handle--composition" title="Master preview out: wire into outputs" />
      {/* T12.8: this preview as a layer of another master preview (or an output's own layer). */}
      <Handle type="source" position={Position.Right} id={LAYER_OUT_HANDLE} isConnectable={!readOnly} className="sc-handle--layer sc-handle--nest" title="Use as a layer: wire into a row of another master preview or an output" />
    </div>
  );
}

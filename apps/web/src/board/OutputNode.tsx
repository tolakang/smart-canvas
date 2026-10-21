/**
 * Output node (T4.7): name, size, layout health and a live thumbnail computed by the layout engine and drawn
 * by the same OutputRenderer as export. Its settings (preset, size, scale / DPI, bleed, disconnect) are in the
 * inspector (T13.2, OutputSettings.tsx). Its own layer rows (T12.4): inputs only this output gets, drawn above the
 * master preview's layers; wire an input onto "Add a layer".
 */
import {
  computeLayout,
  outputHealth,
  convertSize,
  deleteOutput,
  disconnectOutputLayer,
  layerSources,
  outputDefaults,
  outputScene,
  resetOutputOverrides,
  updateOutput,
  type OutputNode,
  type OutputSettings,
  type SizePreset,
  type Unit,
} from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import { portHandleId, type OutputFlowNode } from './flow';
import { HealthBadge } from './HealthBadge';
import { Icon, LayerThumb } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

export function presetSettings(p: SizePreset): OutputSettings {
  return {
    presetId: p.id,
    size: { ...p.size },
    ...(p.size.unit === 'mm' ? { dpi: p.dpi ?? outputDefaults('mm').dpi, bleedMm: p.bleedMm ?? 0 } : { bleedMm: p.bleedMm ?? 0 }),
  };
}

/** The name an output gets from its size when none is typed ("1200×630 px"). */
export const sizeLabel = (s: { width: number; height: number; unit: Unit }) => `${s.width}×${s.height} ${s.unit}`;

/**
 * T10.2: an output still named after its size or preset follows size / preset changes (a "1080×1350 px"
 * node showing 1200×630 was misleading); a name typed by hand stays.
 */
export function withAutoLabel(o: OutputNode, presets: readonly SizePreset[], patch: OutputSettings): OutputSettings {
  const auto = o.label === sizeLabel(o.size) || presets.some((p) => p.name === o.label);
  if (!auto || patch.label !== undefined) return patch;
  const preset = patch.presetId ? presets.find((p) => p.id === patch.presetId) : undefined;
  const size = patch.size ?? o.size;
  return { ...patch, label: preset ? preset.name : sizeLabel(size) };
}

/** The settings a px/mm toggle writes: same physical size, and print defaults the first time mm is chosen. */
export function unitSettings(o: OutputNode, unit: Unit): OutputSettings {
  if (o.size.unit === unit) return {};
  return { size: convertSize(o.size, unit), ...(unit === 'mm' && o.dpi === undefined ? { dpi: outputDefaults('mm').dpi } : {}) };
}

export function OutputNodeView({ id, data }: NodeProps<OutputFlowNode>) {
  const { output, connected, layers } = data;
  const updateInternals = useUpdateNodeInternals();
  const handleKey = layers.map((l) => l.sourceId).join(',');
  useEffect(() => updateInternals(id), [id, handleKey, updateInternals]);
  const { doc, readOnly, run, teamId, layoutDeps, missingFonts, openOutputEditor } = useBoard();
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== output.label) run((d) => updateOutput(d, output.id, { label: name }));
  };
  // T7.4: thumbnails lag behind edits (deferred) so typing and dragging stay responsive with 10 outputs.
  const shownDoc = useDeferredValue(doc);
  // The node can outlive its output by a render (React Flow syncs nodes after the doc changes).
  const { scene, health } = useMemo(() => {
    const current = shownDoc.outputs.find((o) => o.id === output.id);
    if (!layoutDeps || !current) return { scene: null, health: null };
    const layout = computeLayout(shownDoc, output.id, layoutDeps);
    return { scene: outputScene(layout, current), health: outputHealth(shownDoc, output.id, layout, missingFonts) };
  }, [shownDoc, output.id, layoutDeps, missingFonts]);
  const shownLayers = useMemo(() => layerSources(shownDoc), [shownDoc]);
  const bleed = output.bleedMm ?? 0;

  return (
    <div className={`sc-node sc-node--output${connected ? '' : ' sc-node--frozen'}`} aria-label={`Output ${output.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly && !connected} className="sc-handle--composition" title="Master preview in" />
      <div className="sc-node__head">
        {renaming !== null ? (
          <input
            className={`sc-rename ${NO_CANVAS}`}
            aria-label="Output name"
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
          <div className="sc-node__title" title={`${output.label}${readOnly ? '' : ' — double-click to rename'}`} onDoubleClick={() => !readOnly && setRenaming(output.label)}>
            {output.label}
          </div>
        )}
        {health && <HealthBadge health={health} />}
        <button type="button" className={`sc-open-editor ${NO_CANVAS}`} onClick={() => openOutputEditor(output.id)} aria-label={`${readOnly ? 'View' : 'Edit'} output ${output.label}`}>
          {readOnly ? 'View' : 'Edit'}
        </button>
        {!readOnly && (
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`Delete output ${output.label}`}
            title="Delete output"
            onClick={() => window.confirm(`Delete output “${output.label}”?`) && run((d) => deleteOutput(d, output.id))}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="sc-node__meta">
        {output.size.width} × {output.size.height} {output.size.unit}
        {bleed > 0 && ` · bleed ${bleed} mm`}
      </div>
      {output.overrides.length > 0 && (
        <div className="sc-node__overrides">
          <span className="sc-chip" title="Layers changed by hand on this output" aria-label={`${output.overrides.length} overridden layers`}>
            {output.overrides.length} edited by hand
          </span>
          {!readOnly && (
            <button
              type="button"
              className={`sc-btn sc-btn--ghost ${NO_CANVAS}`}
              onClick={() => window.confirm(`Reset all overridden layers of “${output.label}” to auto?`) && run((d) => resetOutputOverrides(d, output.id))}
            >
              Reset output
            </button>
          )}
        </div>
      )}
      {!connected && (
        <div className="sc-node__meta sc-output__frozen">
          Disconnected — layout frozen{output.overrides.length > 0 && ` · ${output.overrides.length} override${output.overrides.length === 1 ? '' : 's'}`}
        </div>
      )}
      <div className="sc-main-thumb" aria-label={`${output.label} preview`}>
        {scene ? (
          <RenderThumbnail scene={scene} sources={shownLayers} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={236} maxHeight={180} />
        ) : (
          <span className="sc-muted">Loading fonts…</span>
        )}
      </div>
      {(layers.length > 0 || !readOnly) && (
        <ol className="sc-ports sc-ports--output" aria-label={`${output.label} own layers (front first)`}>
          {layers.map((l) => {
            const source = shownDoc.sources.find((s) => s.id === l.sourceId) ?? doc.sources.find((s) => s.id === l.sourceId);
            return (
              <li key={l.sourceId} className={`sc-port sc-port--wired${l.visible ? '' : ' sc-port--hidden'}`} data-port={l.port}>
                <Handle type="target" position={Position.Left} id={portHandleId(l.port)} isConnectable={!readOnly} className="sc-handle--layer" title="Output-only layer in" />
                {source && <LayerThumb source={source} />}
                <span className="sc-port__label">{l.label}</span>
                {!readOnly && (
                  <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Remove ${l.label} from ${output.label}`} title="Remove from this output" onClick={() => run((d) => disconnectOutputLayer(d, output.id, l.sourceId))}>
                    <Icon name="close" />
                  </button>
                )}
              </li>
            );
          })}
          {!readOnly && (
            <li className="sc-port sc-port--add" data-port={layers.length}>
              <Handle type="target" position={Position.Left} id={portHandleId(layers.length)} isConnectable className="sc-handle--layer" title="Output-only layer in: wire an input here" />
              <span className="sc-port__hint">Add a layer only this output gets</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * Output node (T4.7): size in px or mm, preset picker, bleed / dpi / export scale, and a live thumbnail
 * computed by the layout engine and drawn by the same OutputRenderer as export.
 */
import {
  computeLayout,
  convertSize,
  deleteOutput,
  DPI_RANGE,
  BLEED_MM_MAX,
  exceedsExportCap,
  exportPixels,
  LIMITS,
  outputDefaults,
  outputScene,
  updateOutput,
  type OutputNode,
  type OutputSettings,
  type SizePreset,
  type Unit,
} from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useMemo } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { NumberField } from '../ui/NumberField';
import { useBoard } from './context';
import type { OutputFlowNode } from './flow';

const NO_CANVAS = 'nodrag nopan nowheel';
const SCALES = [1, 2, 3, 4] as const;

export function presetSettings(p: SizePreset): OutputSettings {
  return {
    presetId: p.id,
    size: { ...p.size },
    ...(p.size.unit === 'mm' ? { dpi: p.dpi ?? outputDefaults('mm').dpi, bleedMm: p.bleedMm ?? 0 } : { bleedMm: p.bleedMm ?? 0 }),
  };
}

/** The settings a px/mm toggle writes: same physical size, and print defaults the first time mm is chosen. */
export function unitSettings(o: OutputNode, unit: Unit): OutputSettings {
  if (o.size.unit === unit) return {};
  return { size: convertSize(o.size, unit), ...(unit === 'mm' && o.dpi === undefined ? { dpi: outputDefaults('mm').dpi } : {}) };
}

export function OutputNodeView({ data }: NodeProps<OutputFlowNode>) {
  const { output, connected } = data;
  const { doc, readOnly, run, teamId, layoutDeps, presets, disconnectOutput, reconnectOutput } = useBoard();
  const set = (patch: OutputSettings) => run((d) => updateOutput(d, output.id, patch));
  // The node can outlive its output by a render (React Flow syncs nodes after the doc changes).
  const scene = useMemo(
    () => (layoutDeps && doc.outputs.some((o) => o.id === output.id) ? outputScene(computeLayout(doc, output.id, layoutDeps)) : null),
    [doc, output.id, layoutDeps],
  );
  const bleed = output.bleedMm ?? 0;
  const px = exportPixels(output, bleed > 0);
  const overCap = exceedsExportCap(px);
  const mm = output.size.unit === 'mm';
  const step = mm ? 0.1 : 1;

  return (
    <div className={`sc-node sc-node--output${connected ? '' : ' sc-node--frozen'}`} aria-label={`Output ${output.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly && !connected} />
      <div className="sc-node__head">
        <div className="sc-node__title" title={output.label}>
          {output.label}
        </div>
        {!readOnly && (
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`Delete output ${output.label}`}
            onClick={() => window.confirm(`Delete output “${output.label}”?`) && run((d) => deleteOutput(d, output.id))}
          >
            ×
          </button>
        )}
      </div>
      <div className="sc-node__meta">
        {output.size.width} × {output.size.height} {output.size.unit}
        {bleed > 0 && ` · bleed ${bleed} mm`}
      </div>
      {!connected && (
        <div className="sc-node__meta sc-output__frozen">
          Disconnected — layout frozen{output.overrides.length > 0 && ` · ${output.overrides.length} override${output.overrides.length === 1 ? '' : 's'}`}
        </div>
      )}
      <div className="sc-main-thumb" aria-label={`${output.label} preview`}>
        {scene ? (
          <RenderThumbnail scene={scene} sources={doc.sources} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={236} maxHeight={180} />
        ) : (
          <span className="sc-muted">Loading fonts…</span>
        )}
      </div>
      <fieldset className={`sc-output__settings ${NO_CANVAS}`} disabled={readOnly}>
        {presets.length > 0 && (
          <label className="sc-field sc-field--col">
            Preset
            <select
              value={output.presetId ?? ''}
              onChange={(e) => {
                const p = presets.find((x) => x.id === e.target.value);
                set(p ? presetSettings(p) : { presetId: undefined });
              }}
            >
              <option value="">Custom size</option>
              {(['social', 'print'] as const).map((group) => (
                <optgroup key={group} label={group === 'print' ? 'Print' : 'Social'}>
                  {presets
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.size.width}×{p.size.height} {p.size.unit}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <div className="sc-output__row">
          <NumberField
            label="Width"
            value={output.size.width}
            min={step}
            max={100000}
            step={step}
            disabled={readOnly}
            onCommit={(n) => n && set({ size: { ...output.size, width: n }, presetId: undefined })}
          />
          <NumberField
            label="Height"
            value={output.size.height}
            min={step}
            max={100000}
            step={step}
            disabled={readOnly}
            onCommit={(n) => n && set({ size: { ...output.size, height: n }, presetId: undefined })}
          />
          <div className="sc-seg" role="group" aria-label="Unit">
            {(['px', 'mm'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={output.size.unit === u} onClick={() => set(unitSettings(output, u))}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="sc-output__row">
          {mm ? (
            <NumberField
              label="DPI"
              value={output.dpi ?? outputDefaults('mm').dpi ?? 300}
              min={DPI_RANGE.min}
              max={DPI_RANGE.max}
              step={1}
              disabled={readOnly}
              onCommit={(n) => n && set({ dpi: Math.min(Math.max(Math.round(n), DPI_RANGE.min), DPI_RANGE.max) })}
            />
          ) : (
            <label className="sc-field sc-field--col">
              Scale
              <select value={output.exportScale ?? 1} onChange={(e) => set({ exportScale: Number(e.target.value) })}>
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          )}
          <NumberField
            label="Bleed mm"
            value={bleed}
            min={0}
            max={BLEED_MM_MAX}
            step={0.5}
            disabled={readOnly}
            onCommit={(n) => set({ bleedMm: Math.min(Math.max(n ?? 0, 0), BLEED_MM_MAX) })}
          />
        </div>
      </fieldset>
      {!readOnly && (
        <button
          type="button"
          className={`sc-link ${NO_CANVAS}`}
          onClick={() => (connected ? disconnectOutput(output.id) : reconnectOutput(output.id))}
        >
          {connected ? 'Disconnect' : 'Reconnect'}
        </button>
      )}
      <div className={`sc-node__meta${overCap ? ' sc-error' : ''}`} role={overCap ? 'alert' : undefined}>
        Export {px.w} × {px.h} px{bleed > 0 && ' incl. bleed'}
        {overCap && ` — over the ${LIMITS.maxExportEdgePx} px limit; lower the size, ${mm ? 'DPI' : 'scale'} or bleed`}
      </div>
    </div>
  );
}

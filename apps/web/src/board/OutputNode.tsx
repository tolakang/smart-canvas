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
  resetOutputOverrides,
  updateOutput,
  type OutputNode,
  type OutputSettings,
  type SizePreset,
  type Unit,
} from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useDeferredValue, useMemo, useState } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { NumberField } from '../ui/NumberField';
import { useBoard } from './context';
import type { OutputFlowNode } from './flow';
import { Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';
const SCALES = [1, 2, 3, 4] as const;

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

export function OutputNodeView({ data }: NodeProps<OutputFlowNode>) {
  const { output, connected } = data;
  const { doc, readOnly, run, teamId, layoutDeps, presets, disconnectOutput, reconnectOutput, openOutputEditor } = useBoard();
  const set = (patch: OutputSettings) => run((d) => updateOutput(d, output.id, withAutoLabel(output, presets, patch)));
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== output.label) run((d) => updateOutput(d, output.id, { label: name }));
  };
  // T7.4: thumbnails lag behind edits (deferred) so typing and dragging stay responsive with 10 outputs.
  const shownDoc = useDeferredValue(doc);
  // The node can outlive its output by a render (React Flow syncs nodes after the doc changes).
  const scene = useMemo(() => {
    const current = shownDoc.outputs.find((o) => o.id === output.id);
    return layoutDeps && current ? outputScene(computeLayout(shownDoc, output.id, layoutDeps), current) : null;
  }, [shownDoc, output.id, layoutDeps]);
  const bleed = output.bleedMm ?? 0;
  const px = exportPixels(output, bleed > 0);
  const overCap = exceedsExportCap(px);
  const mm = output.size.unit === 'mm';
  const step = mm ? 0.1 : 1;

  return (
    <div className={`sc-node sc-node--output${connected ? '' : ' sc-node--frozen'}`} aria-label={`Output ${output.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly && !connected} />
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
          <RenderThumbnail scene={scene} sources={shownDoc.sources} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={236} maxHeight={180} />
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
          className={`sc-btn ${NO_CANVAS}`}
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

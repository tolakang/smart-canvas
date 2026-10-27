/**
 * An output's settings (T4.7; moved from the node card into the inspector by T13.2): preset, size in px or mm,
 * DPI / export scale, bleed, disconnect / reconnect, and the export pixel size.
 */
import { BLEED_MM_MAX, DPI_RANGE, exceedsExportCap, exportPixels, LIMITS, outputDefaults, updateOutput, type OutputNode, type OutputSettings as Settings } from '@smart-canvas/core';
import { NumberField } from '../ui/NumberField';
import { META } from './card';
import { useBoard } from './context';
import { presetSettings, unitSettings, withAutoLabel } from './OutputNode';

const NO_CANVAS = 'nodrag nopan nowheel';
const SCALES = [1, 2, 3, 4] as const;

/** A row of an output's settings: two fields and a small control (unit, a note) at the end. */
export const OUTPUT_ROW = 'sc-output__row grid grid-cols-[1fr_1fr_auto] [align-items:end] gap-(--sp-2) [&_.sc-field_input[type=number]]:w-full';

export function OutputSettings({ output, connected }: { output: OutputNode; connected: boolean }) {
  const { readOnly, run, presets, disconnectOutput, reconnectOutput } = useBoard();
  const set = (patch: Settings) => run((d) => updateOutput(d, output.id, withAutoLabel(output, presets, patch)));
  const bleed = output.bleedMm ?? 0;
  const px = exportPixels(output, bleed > 0);
  const overCap = exceedsExportCap(px);
  const mm = output.size.unit === 'mm';
  const step = mm ? 0.1 : 1;
  return (
    <>
      <fieldset className={`sc-output__settings m-0 grid gap-(--sp-2) p-0 text-xs text-muted [border:0] ${NO_CANVAS}`} disabled={readOnly}>
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
        <div className={OUTPUT_ROW}>
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
        <div className={OUTPUT_ROW}>
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
      <div className={`${META}${overCap ? ' sc-error' : ''}`} role={overCap ? 'alert' : undefined}>
        Export {px.w} × {px.h} px{bleed > 0 && ' incl. bleed'}
        {overCap && ` — over the ${LIMITS.maxExportEdgePx} px limit; lower the size, ${mm ? 'DPI' : 'scale'} or bleed`}
      </div>
    </>
  );
}

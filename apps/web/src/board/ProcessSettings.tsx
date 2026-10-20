/**
 * Process settings in the inspector (T12.5): name, what feeds it, and its op — Crop (a rect in % of the
 * picture), Adjust (opacity, brightness, contrast, saturation in %, blur in px), Flip / Rotate. Numbers commit
 * on blur or Enter, so each edit is one undo step.
 */
import { processInput, updateProcess, type ProcessNode, type ProcessOp } from '@smart-canvas/core';
import { useState } from 'react';
import { NumberField } from '../ui/NumberField';
import { useBoard } from './context';

export function ProcessSettings({ process }: { process: ProcessNode }) {
  const { doc, readOnly, run } = useBoard();
  const [name, setName] = useState(process.label);
  const set = (op: ProcessOp) => run((d) => updateProcess(d, process.id, { op }));
  const from = processInput(doc, process.id);
  const fromLabel = doc.sources.find((s) => s.id === from)?.label ?? doc.processes.find((p) => p.id === from)?.label;
  const op = process.op;
  const percent = (label: string, value: number | undefined, base: number, max: number, commit: (v: number) => void, ariaLabel?: string) => (
    <NumberField
      label={label}
      ariaLabel={ariaLabel ?? label}
      value={Math.round((value ?? base) * 1000) / 10}
      min={0}
      max={max}
      step={1}
      disabled={readOnly}
      onCommit={(n) => n !== null && commit(Math.min(max, Math.max(0, n)) / 100)}
    />
  );

  return (
    <div className="sc-inspector-panel__form">
      <label className="sc-field">
        <span>Name</span>
        <input
          aria-label="Process name"
          value={name}
          disabled={readOnly}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== process.label && run((d) => updateProcess(d, process.id, { label: name }))}
        />
      </label>
      <p className="sc-muted sc-inspector-panel__hint">{fromLabel ? `Takes ${fromLabel}` : 'Wire an input (or another process) into it.'}</p>
      {op.type === 'crop' && (
        <div className="sc-grid-2">
          {percent('Left %', op.rect.x, 0, 99, (x) => set({ ...op, rect: { ...op.rect, x } }), 'Crop left')}
          {percent('Top %', op.rect.y, 0, 99, (y) => set({ ...op, rect: { ...op.rect, y } }), 'Crop top')}
          {percent('Width %', op.rect.w, 1, 100, (w) => set({ ...op, rect: { ...op.rect, w: Math.max(0.01, w) } }), 'Crop width')}
          {percent('Height %', op.rect.h, 1, 100, (h) => set({ ...op, rect: { ...op.rect, h: Math.max(0.01, h) } }), 'Crop height')}
        </div>
      )}
      {op.type === 'adjust' && (
        <div className="sc-grid-2">
          {percent('Opacity %', op.opacity, 1, 100, (opacity) => set({ ...op, opacity }), 'Opacity')}
          {percent('Brightness %', op.brightness, 1, 300, (brightness) => set({ ...op, brightness }), 'Brightness')}
          {percent('Contrast %', op.contrast, 1, 300, (contrast) => set({ ...op, contrast }), 'Contrast')}
          {percent('Saturation %', op.saturation, 1, 300, (saturation) => set({ ...op, saturation }), 'Saturation')}
          <NumberField label="Blur px" ariaLabel="Blur" value={op.blurPx ?? 0} min={0} max={100} step={1} disabled={readOnly} onCommit={(n) => n !== null && set({ ...op, blurPx: Math.min(100, Math.max(0, n)) })} />
        </div>
      )}
      {op.type === 'flip' && (
        <>
          <label className="sc-check">
            <input type="checkbox" checked={op.x} disabled={readOnly} onChange={(e) => set({ ...op, x: e.target.checked })} /> Mirror (left ↔ right)
          </label>
          <label className="sc-check">
            <input type="checkbox" checked={op.y} disabled={readOnly} onChange={(e) => set({ ...op, y: e.target.checked })} /> Flip vertical
          </label>
          <label className="sc-field">
            <span>Turn</span>
            <select aria-label="Turn" value={op.rotate ?? 0} disabled={readOnly} onChange={(e) => set({ ...op, rotate: Number(e.target.value) as 0 | 90 | 180 | 270 })}>
              {[0, 90, 180, 270].map((r) => (
                <option key={r} value={r}>
                  {r}° clockwise
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

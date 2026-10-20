import { outputDefaults, type OutputSettings, type SizePreset, type Unit } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { presetSettings, sizeLabel } from './OutputNode';

export type NewOutput = { label: string; size: { width: number; height: number; unit: Unit } } & OutputSettings;

/** Flow 4: pick a preset or type a size (px or mm); the node appears wired to main. */
export function AddOutputDialog(props: { presets: readonly SizePreset[]; onAdd: (o: NewOutput) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [presetId, setPresetId] = useState('');
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState('1080');
  const [height, setHeight] = useState('1350');
  const [unit, setUnit] = useState<Unit>('px');
  const preset = props.presets.find((p) => p.id === presetId);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (preset) {
      props.onAdd({ label: label.trim() || preset.name, size: { ...preset.size }, ...presetSettings(preset) });
      return;
    }
    const size = { width: Number(width), height: Number(height), unit };
    props.onAdd({ label: label.trim() || sizeLabel(size), size, ...outputDefaults(unit) });
  }

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="add-output-title">
      <form onSubmit={submit} className="sc-card">
        <h1 id="add-output-title">Add output</h1>
        {props.presets.length > 0 && (
          <label>
            Preset
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              <option value="">Custom size</option>
              {(['social', 'print'] as const).map((group) => (
                <optgroup key={group} label={group === 'print' ? 'Print' : 'Social'}>
                  {props.presets
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
        {!preset && (
          <div className="sc-row">
            <label>
              Width
              <input type="number" required min={unit === 'mm' ? 0.1 : 1} step={unit === 'mm' ? 0.1 : 1} value={width} onChange={(e) => setWidth(e.target.value)} />
            </label>
            <label>
              Height
              <input type="number" required min={unit === 'mm' ? 0.1 : 1} step={unit === 'mm' ? 0.1 : 1} value={height} onChange={(e) => setHeight(e.target.value)} />
            </label>
            <label>
              Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="px">px</option>
                <option value="mm">mm</option>
              </select>
            </label>
          </div>
        )}
        <label>
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={preset?.name ?? 'e.g. Instagram portrait'} maxLength={200} />
        </label>
        <div className="sc-row">
          <button type="submit">Add</button>
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

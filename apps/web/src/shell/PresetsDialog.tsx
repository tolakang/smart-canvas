/**
 * Preset manager (T4.8, screen 7): built-in print/social sizes plus the team's own.
 * Everyone sees the list; admins add, edit and delete team presets. Built-ins are read-only.
 */
import type { PresetGroup, SizePreset, Unit } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

interface Draft {
  id: string | null;
  group: PresetGroup;
  name: string;
  width: string;
  height: string;
  unit: Unit;
  dpi: string;
  bleedMm: string;
}
const EMPTY: Draft = { id: null, group: 'social', name: '', width: '1080', height: '1080', unit: 'px', dpi: '', bleedMm: '' };

const sizeText = (p: SizePreset) =>
  `${p.size.width} × ${p.size.height} ${p.size.unit}${p.dpi ? ` · ${p.dpi} dpi` : ''}${p.bleedMm ? ` · bleed ${p.bleedMm} mm` : ''}`;

export function PresetsDialog(props: { teamId: string; isAdmin: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = `/teams/${props.teamId}/presets`;
  const [list, setList] = useState<SizePreset[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let live = true;
    api<SizePreset[]>('GET', url).then(
      (l) => live && setList(l),
      () => live && setError('Could not load presets.'),
    );
    return () => {
      live = false;
    };
  }, [url, reload]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const edit = (p: SizePreset) =>
    setDraft({
      id: p.id,
      group: p.group,
      name: p.name,
      width: String(p.size.width),
      height: String(p.size.height),
      unit: p.size.unit,
      dpi: p.dpi ? String(p.dpi) : '',
      bleedMm: p.bleedMm ? String(p.bleedMm) : '',
    });

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      group: draft.group,
      name: draft.name.trim(),
      size: { width: Number(draft.width), height: Number(draft.height), unit: draft.unit },
      dpi: draft.dpi ? Number(draft.dpi) : null,
      bleedMm: draft.bleedMm ? Number(draft.bleedMm) : null,
    };
    try {
      await api(draft.id ? 'PUT' : 'POST', draft.id ? `${url}/${draft.id}` : url, body);
      setDraft(EMPTY);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? 'Check the values: size > 0, DPI 72–1200, bleed 0–50 mm.' : 'Could not save the preset.');
    }
  }

  async function remove(p: SizePreset) {
    if (!window.confirm(`Delete preset “${p.name}”?`)) return;
    try {
      await api('DELETE', `${url}/${p.id}`);
      if (draft.id === p.id) setDraft(EMPTY);
      setReload((n) => n + 1);
    } catch {
      setError('Could not delete the preset.');
    }
  }

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="presets-title">
      <div className="sc-card sc-presets">
        <h1 id="presets-title">Size presets</h1>
        <p className="sc-muted sc-lede">Sizes for new outputs. Built-in ones are fixed{props.isAdmin ? '; add your team’s own below.' : '; admins can add the team’s own.'}</p>
        {list === null ? (
          <p className="sc-muted">Loading…</p>
        ) : (
          (['social', 'print'] as const).map((group) => (
            <section key={group} aria-label={group === 'print' ? 'Print presets' : 'Social presets'}>
              <h2>{group === 'print' ? 'Print' : 'Social'}</h2>
              <ul className="sc-list sc-rows">
                {list
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <li key={p.id} data-preset={p.name}>
                      <span className="sc-rows__main">
                        <span className="sc-rows__name">{p.name}</span>
                        <span className="sc-rows__meta">{sizeText(p)}</span>
                      </span>
                      {p.teamId === null ? (
                        <span className="sc-badge">Built-in</span>
                      ) : (
                        props.isAdmin && (
                          <span className="sc-rows__actions">
                            <button type="button" className="sc-btn sc-btn--ghost" onClick={() => edit(p)} aria-label={`Edit ${p.name}`}>
                              Edit
                            </button>
                            <button type="button" className="sc-btn sc-btn--ghost sc-btn--danger" onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}>
                              Delete
                            </button>
                          </span>
                        )
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
        {props.isAdmin && (
          <form className="sc-form" onSubmit={save} aria-label={draft.id ? 'Edit preset' : 'New preset'}>
            <h2>{draft.id ? `Edit “${draft.name}”` : 'New team preset'}</h2>
            <div className="sc-fields">
              <label className="sc-fields__wide">
                Name
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} placeholder="e.g. Shop banner" />
              </label>
              <label>
                Group
                <select value={draft.group} onChange={(e) => set({ group: e.target.value as PresetGroup })}>
                  <option value="social">Social</option>
                  <option value="print">Print</option>
                </select>
              </label>
              <label>
                Unit
                <select value={draft.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
                  <option value="px">px</option>
                  <option value="mm">mm</option>
                </select>
              </label>
              <label>
                Width
                <input type="number" inputMode="decimal" required min={0.1} step="any" value={draft.width} onChange={(e) => set({ width: e.target.value })} />
              </label>
              <label>
                Height
                <input type="number" inputMode="decimal" required min={0.1} step="any" value={draft.height} onChange={(e) => set({ height: e.target.value })} />
              </label>
              <label>
                DPI
                <input type="number" inputMode="numeric" min={72} max={1200} step={1} placeholder={draft.unit === 'mm' ? '300' : 'Optional'} value={draft.dpi} onChange={(e) => set({ dpi: e.target.value })} />
              </label>
              <label>
                Bleed (mm)
                <input type="number" inputMode="decimal" min={0} max={50} step="any" placeholder="0" value={draft.bleedMm} onChange={(e) => set({ bleedMm: e.target.value })} />
              </label>
            </div>
            <div className="sc-form__actions">
              {draft.id && (
                <button type="button" className="sc-btn" onClick={() => setDraft(EMPTY)}>
                  Cancel edit
                </button>
              )}
              <button type="submit" className="sc-btn sc-btn--primary">
                {draft.id ? 'Save changes' : 'Add preset'}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <div className="sc-dialog__foot">
          <button type="button" className="sc-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

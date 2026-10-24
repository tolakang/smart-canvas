/**
 * Preset manager (T4.8, screen 7): built-in print/social sizes plus the team's own.
 * Everyone sees the list; admins add, edit and delete team presets. Built-ins are read-only.
 * M4: "Preset node families" lists every family with its sizes; admins rename or delete a team family as a whole.
 */
import type { PresetGroup, SizePreset, Unit } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { AskDialog, type AskSpec } from '../ui/AskDialog';

interface Draft {
  id: string | null;
  group: PresetGroup;
  name: string;
  /** N5: the Preset node family ('' = a single size). */
  family: string;
  width: string;
  height: string;
  unit: Unit;
  dpi: string;
  bleedMm: string;
}
const EMPTY: Draft = { id: null, group: 'social', name: '', family: '', width: '1080', height: '1080', unit: 'px', dpi: '', bleedMm: '' };

/** M4: the families in the list, in list order, with their sizes; built-in when any size is built-in. */
export function familiesOf(list: readonly SizePreset[]): { name: string; builtIn: boolean; sizes: SizePreset[] }[] {
  const out = new Map<string, { name: string; builtIn: boolean; sizes: SizePreset[] }>();
  for (const p of list) {
    if (!p.family) continue;
    const f = out.get(p.family) ?? { name: p.family, builtIn: false, sizes: [] };
    f.sizes.push(p);
    if (p.teamId === null) f.builtIn = true;
    out.set(p.family, f);
  }
  return [...out.values()];
}

const familyError = (err: unknown) => {
  const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
  if (code === 'builtin_family') return 'That is a built-in family’s name; pick another.';
  if (code === 'family_exists') return 'The team already has a family with that name.';
  return 'Could not change the family.';
};

const sizeText = (p: SizePreset) =>
  `${p.family ? `${p.family} family · ` : ''}${p.size.width} × ${p.size.height} ${p.size.unit}${p.dpi ? ` · ${p.dpi} dpi` : ''}${p.bleedMm ? ` · bleed ${p.bleedMm} mm` : ''}`;

export function PresetsDialog(props: { teamId: string; isAdmin: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = `/teams/${props.teamId}/presets`;
  const [list, setList] = useState<SizePreset[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [ask, setAsk] = useState<(AskSpec & { done: (v: string | null) => void }) | null>(null);

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
      family: p.family ?? '',
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
      family: draft.family.trim() || null,
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

  const familyUrl = (name: string) => `/teams/${props.teamId}/preset-families/${encodeURIComponent(name)}`;
  const renameFamily = (name: string) =>
    setAsk({
      title: 'Rename family',
      message: 'New Preset nodes use the new name. Preset nodes already made from it offer the new name when their project is opened.',
      input: { label: 'Family name', value: name },
      confirm: 'Rename',
      done: (to) => {
        if (!to || to === name) return;
        setError(null);
        api('PUT', familyUrl(name), { name: to }).then(
          () => setReload((n) => n + 1),
          (err: unknown) => setError(familyError(err)),
        );
      },
    });
  const deleteFamily = (name: string, count: number) =>
    setAsk({
      title: `Delete “${name}”?`,
      message: `Its ${count} ${count === 1 ? 'size' : 'sizes'} will be deleted for the whole team. Preset nodes already on boards stay.`,
      confirm: 'Delete family',
      danger: true,
      done: (ok) => {
        if (ok === null) return;
        setError(null);
        api('DELETE', familyUrl(name)).then(
          () => {
            if (draft.family.trim() === name) setDraft(EMPTY);
            setReload((n) => n + 1);
          },
          (err: unknown) => setError(familyError(err)),
        );
      },
    });

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="presets-title">
      <div className="sc-card sc-presets">
        <h1 id="presets-title">Size presets</h1>
        <p className="sc-muted sc-lede">Sizes for new outputs. Built-in ones are fixed{props.isAdmin ? '; add your team’s own below.' : '; admins can add the team’s own.'}</p>
        {list !== null && familiesOf(list).length > 0 && (
          <section aria-label="Preset node families">
            <h2>Preset node families</h2>
            <ul className="sc-list sc-rows sc-families">
              {familiesOf(list).map((f) => (
                <li key={f.name} data-family={f.name}>
                  <details className="sc-family">
                    <summary aria-label={`${f.name}: ${f.sizes.length} ${f.sizes.length === 1 ? 'size' : 'sizes'}`}>
                      <span className="sc-rows__name">{f.name}</span>
                      <span className="sc-rows__meta">
                        {f.sizes.length} {f.sizes.length === 1 ? 'size' : 'sizes'}
                      </span>
                    </summary>
                    <ul className="sc-family__sizes" aria-label={`${f.name} sizes`}>
                      {f.sizes.map((p) => (
                        <li key={p.id}>
                          {p.name} <span className="sc-muted">{`${p.size.width} × ${p.size.height} ${p.size.unit}`}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {f.builtIn ? (
                    <span className="sc-badge">Built-in</span>
                  ) : (
                    props.isAdmin && (
                      <span className="sc-rows__actions">
                        <button type="button" className="sc-btn sc-btn--ghost" onClick={() => renameFamily(f.name)} aria-label={`Rename family ${f.name}`}>
                          Rename
                        </button>
                        <button type="button" className="sc-btn sc-btn--ghost sc-btn--danger" onClick={() => deleteFamily(f.name, f.sizes.length)} aria-label={`Delete family ${f.name}`}>
                          Delete
                        </button>
                      </span>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
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
              <label className="sc-fields__wide">
                Preset node family
                <input value={draft.family} onChange={(e) => set({ family: e.target.value })} maxLength={60} placeholder="e.g. GDN — sizes of one family are added together" />
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
        {ask && (
          <AskDialog
            ask={ask}
            onDone={(v) => {
              setAsk(null);
              ask.done(v);
            }}
          />
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

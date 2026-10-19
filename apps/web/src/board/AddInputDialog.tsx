import { ALLOWED_BEHAVIORS, type Behavior, type SourceKind } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';

const KINDS: { kind: SourceKind; label: string }[] = [
  { kind: 'image', label: 'Image (PNG, JPEG, WebP)' },
  { kind: 'vector', label: 'Vector (SVG)' },
  { kind: 'text', label: 'Text' },
  { kind: 'fill', label: 'Fill (colour / gradient)' },
];
const DEFAULT_NAME: Record<SourceKind, string> = { image: 'Image', vector: 'Vector', text: 'Text', fill: 'Fill' };
const BEHAVIOR_LABEL: Record<Behavior, string> = {
  background: 'Background',
  subject: 'Subject',
  text: 'Text',
  logo: 'Logo',
  decoration: 'Decoration',
};

export interface NewInput {
  kind: SourceKind;
  label: string;
  behavesLike: Behavior;
}

export function AddInputDialog(props: { onAdd: (input: NewInput) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<SourceKind>('image');
  const [behavesLike, setBehavesLike] = useState<Behavior>('subject');
  const [label, setLabel] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function changeKind(next: SourceKind) {
    setKind(next);
    const allowed = ALLOWED_BEHAVIORS[next];
    if (!allowed.includes(behavesLike)) setBehavesLike(allowed[0] ?? 'decoration');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    props.onAdd({ kind, behavesLike, label: label.trim() || DEFAULT_NAME[kind] });
  }

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="add-input-title">
      <form onSubmit={submit} className="sc-card">
        <h1 id="add-input-title">Add input</h1>
        <label>
          Type
          <select value={kind} onChange={(e) => changeKind(e.target.value as SourceKind)}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={DEFAULT_NAME[kind]} maxLength={200} />
        </label>
        <label>
          Behaves like
          <select value={behavesLike} onChange={(e) => setBehavesLike(e.target.value as Behavior)}>
            {ALLOWED_BEHAVIORS[kind].map((b) => (
              <option key={b} value={b}>
                {BEHAVIOR_LABEL[b]}
              </option>
            ))}
          </select>
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

/**
 * A small modal question for the Projects screen: a name to type (rename, duplicate, save as template) or a yes /
 * no (delete). Replaces the browser's prompt / confirm: styled like the app, keyboard friendly (Enter confirms,
 * Escape cancels), and the answer comes back through `onDone` (null = cancelled).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DIALOG } from './tw';

export interface AskSpec {
  title: string;
  message?: string;
  /** A text field to fill (its label and starting value); absent = a yes / no question. */
  input?: { label: string; value: string };
  confirm: string;
  danger?: boolean;
}

/** `fieldClass`: extra classes for the text field's label, so it matches the dialog it is asked from. */
export function AskDialog({ ask, onDone, fieldClass = '' }: { ask: AskSpec; onDone: (value: string | null) => void; fieldClass?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(ask.input?.value ?? '');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ask.input && !value.trim()) return;
    onDone(ask.input ? value.trim() : '');
  };
  return (
    <dialog ref={ref} className={DIALOG} aria-labelledby="ask-title" onCancel={() => onDone(null)}>
      <form className="sc-card sc-ask grid" onSubmit={submit}>
        <h2 id="ask-title">{ask.title}</h2>
        {ask.message && <p className="sc-muted m-0">{ask.message}</p>}
        {ask.input && (
          <label className={`sc-field sc-field--col ${fieldClass}`}>
            {ask.input.label}
            <input value={value} autoFocus maxLength={200} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <div className="sc-form__actions">
          <button type="button" className="sc-btn" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className={`sc-btn ${ask.danger ? 'sc-btn--danger-solid' : 'sc-btn--primary'}`} autoFocus={!ask.input} disabled={!!ask.input && !value.trim()}>
            {ask.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}

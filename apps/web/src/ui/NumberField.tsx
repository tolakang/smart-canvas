import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** How long after a pause in typing a valid number is committed (live preview), ms. */
const LIVE_COMMIT_MS = 300;

/**
 * A number input that previews while typing and commits on blur or Enter. A valid value is also committed
 * after a short pause, so the canvas follows the field live without writing once per keystroke. Clamping
 * never fights the user's typing: the draft is kept while the field is focused, then shown as stored.
 */
export function NumberField(props: {
  label: string;
  value: number | '';
  placeholder?: string;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number | null) => void;
  disabled: boolean;
  className?: string;
  /** Accessible name when the visible label is short ("W" → "Width"). */
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(String(props.value));
  const [focused, setFocused] = useState(false);
  /** The field has edits not yet written back (so a rounded shown value isn't written back on blur). */
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  /** The last value sent, so a live commit isn't repeated on blur. */
  const sent = useRef<number | null>(props.value === '' ? null : props.value);
  const commitRef = useRef(props.onCommit);
  useEffect(() => {
    commitRef.current = props.onCommit;
  }, [props.onCommit]);
  // The stored value changed from outside (undo, another edit, a clamp): show it when not being edited.
  useEffect(() => {
    if (focused || dirty.current) return;
    const next = String(props.value);
    sent.current = props.value === '' ? null : props.value;
    setDraft((d) => (d === next ? d : next));
  }, [props.value, focused]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const send = (n: number | null) => {
    sent.current = n;
    commitRef.current(n);
  };
  /** Write the typed value if it is valid and different from what was already sent. */
  const write = () => {
    const t = draft.trim();
    if (t === '') return false;
    const n = Number(t);
    if (!Number.isFinite(n)) return false;
    if (n === sent.current) return false;
    send(n);
    return true;
  };
  const live = () => {
    if (!dirty.current) return;
    if (draft.trim() === '') return; // clearing to retype is not "empty"
    write();
  };
  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(live, LIVE_COMMIT_MS);
  };
  const commit = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const t = draft.trim();
    if (t === '') {
      dirty.current = false;
      if (sent.current !== null) send(null);
      return;
    }
    if (!Number.isFinite(Number(t))) {
      dirty.current = false;
      setDraft(String(props.value));
      return;
    }
    dirty.current = false;
    write();
  };
  return (
    <label className={`sc-field sc-field--col${props.className ? ` ${props.className}` : ''}`}>
      {props.label}
      <input
        type="number"
        aria-label={props.ariaLabel}
        value={draft}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          dirty.current = true;
          schedule();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.currentTarget.blur(), undefined)}
      />
    </label>
  );
}

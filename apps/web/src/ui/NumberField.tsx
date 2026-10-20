import { useState, type KeyboardEvent } from 'react';

/** A number input that commits on blur or Enter, so clamping never fights the user's typing. */
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
  // When the stored value changes (clamped, undo, another edit), show it: adjust state during render.
  const [shown, setShown] = useState(props.value);
  if (shown !== props.value) {
    setShown(props.value);
    setDraft(String(props.value));
  }
  const commit = () => {
    const t = draft.trim();
    if (t === '') props.onCommit(null);
    else if (Number.isFinite(Number(t))) props.onCommit(Number(t));
    else setDraft(String(props.value));
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.currentTarget.blur(), undefined)}
      />
    </label>
  );
}

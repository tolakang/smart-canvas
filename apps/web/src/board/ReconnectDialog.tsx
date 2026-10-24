import { useEffect, useRef } from 'react';

/** D21: reconnecting an output that has overrides asks first. */
export function ReconnectDialog(props: { label: string; overrides: number; onChoose: (choice: 'keep' | 'reset') => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="reconnect-title">
      <div className="sc-card">
        <h1 id="reconnect-title">Reconnect “{props.label}”</h1>
        <p>
          This Preview has {props.overrides} manual {props.overrides === 1 ? 'change' : 'changes'}. Reconnecting re-flows it from the Layer Comp.
        </p>
        <div className="sc-row">
          <button type="button" onClick={() => props.onChoose('keep')}>
            Keep overrides
          </button>
          <button type="button" onClick={() => props.onChoose('reset')}>
            Reset all
          </button>
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}

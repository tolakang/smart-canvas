/**
 * D63: the Review panel — every Preview of the project with its approval (approved, changed since, or not yet) and
 * its open comments, grouped by Preset node. A tap opens that Preview's editor (on its comments when it has some).
 * In the inspector's place, like History.
 */
import { presetSets } from '@smart-canvas/core';
import { useBoard } from './context';
import { Icon } from './LayerRow';
import { APPROVAL, APPROVAL_PILL } from './OutputNode';
import { LIST_DAY, LIST_DAY_TITLE, LIST_NOTE, LIST_OPEN, LIST_ROWS, LIST_TITLE, listItem, PANEL_HEAD, panelClass } from './panel';
import { approvalOf, openCounts } from './review';

const STATE_LABEL = { approved: '✓ Approved', changed: 'Changed since approved', none: 'Not approved' } as const;

export function ReviewPanel(props: { floating?: 'overlay' | 'sheet'; onClose: () => void }) {
  const { doc, review, approvals, openOutputEditor } = useBoard();
  const counts = openCounts(review);
  const sets = presetSets(doc);
  const inSets = new Set(sets.flatMap((s) => s.outputs));
  const groups = [
    ...sets.map((s) => ({ id: s.id, label: s.label, outputs: s.outputs.flatMap((id) => doc.outputs.filter((o) => o.id === id)) })),
    { id: 'loose', label: 'Other Previews', outputs: doc.outputs.filter((o) => !inSets.has(o.id)) },
  ].filter((g) => g.outputs.length > 0);
  const approved = doc.outputs.filter((o) => approvalOf(approvals, o.id).state === 'approved').length;
  const open = [...counts.values()].reduce((n, c) => n + c, 0);
  const { floating } = props;
  return (
    <aside className={panelClass(floating, 'sc-history sc-review')} aria-label="Review">
      <div className={PANEL_HEAD}>
        <span>Review</span>
        <button type="button" className="sc-icon-btn" onClick={props.onClose} aria-label="Close review" title="Close">
          <Icon name="close" />
        </button>
      </div>
      <p className={`sc-muted ${LIST_NOTE}`} role="status">
        {doc.outputs.length === 0
          ? 'No Previews yet.'
          : `${approved} of ${doc.outputs.length} approved · ${open} open ${open === 1 ? 'comment' : 'comments'}`}
      </p>
      {review === null && <p className={`sc-muted ${LIST_NOTE}`}>Loading…</p>}
      {groups.map((g) => (
        <section key={g.id} className={LIST_DAY} aria-label={g.label}>
          <h3 className={LIST_DAY_TITLE}>{g.label}</h3>
          <ul className={LIST_ROWS}>
            {g.outputs.map((o) => {
              const a = approvalOf(approvals, o.id);
              const n = counts.get(o.id) ?? 0;
              return (
                <li key={o.id} className={listItem()}>
                  <button type="button" className={LIST_OPEN} onClick={() => openOutputEditor(o.id, { comments: n > 0 })} aria-label={`Open ${o.label}`}>
                    <span className={LIST_TITLE}>{o.label}</span>
                    <span className="sc-review__row flex flex-wrap items-center gap-8">
                      <span className={`sc-preview__approval sc-preview__approval--${a.state} ${APPROVAL_PILL} ${APPROVAL[a.state]}`}>{STATE_LABEL[a.state]}</span>
                      {n > 0 && <span className="sc-muted">{`${n} open ${n === 1 ? 'comment' : 'comments'}`}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

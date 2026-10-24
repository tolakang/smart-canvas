/**
 * D63: the Review panel — every Preview of the project with its approval (approved, changed since, or not yet) and
 * its open comments, grouped by Preset node. A tap opens that Preview's editor (on its comments when it has some).
 * In the inspector's place, like History.
 */
import { presetSets } from '@smart-canvas/core';
import { useBoard } from './context';
import { Icon } from './LayerRow';
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
    <aside className={`sc-inspector-panel sc-history sc-review${floating ? ` sc-floating sc-floating--${floating} sc-floating--end` : ''}`} aria-label="Review">
      <div className="sc-floating__head">
        <span>Review</span>
        <button type="button" className="sc-icon-btn" onClick={props.onClose} aria-label="Close review" title="Close">
          <Icon name="close" />
        </button>
      </div>
      <p className="sc-muted sc-history__note" role="status">
        {doc.outputs.length === 0
          ? 'No Previews yet.'
          : `${approved} of ${doc.outputs.length} approved · ${open} open ${open === 1 ? 'comment' : 'comments'}`}
      </p>
      {review === null && <p className="sc-muted sc-history__note">Loading…</p>}
      {groups.map((g) => (
        <section key={g.id} className="sc-history__day" aria-label={g.label}>
          <h3>{g.label}</h3>
          <ul>
            {g.outputs.map((o) => {
              const a = approvalOf(approvals, o.id);
              const n = counts.get(o.id) ?? 0;
              return (
                <li key={o.id} className="sc-history__item">
                  <button type="button" className="sc-history__open" onClick={() => openOutputEditor(o.id, { comments: n > 0 })} aria-label={`Open ${o.label}`}>
                    <span className="sc-history__title">{o.label}</span>
                    <span className="sc-review__row">
                      <span className={`sc-preview__approval sc-preview__approval--${a.state}`}>{STATE_LABEL[a.state]}</span>
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

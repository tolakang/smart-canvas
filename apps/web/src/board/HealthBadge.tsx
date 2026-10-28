/**
 * Layout health on a node (D35): a status dot (green ok, grey empty layers to fill (D64), amber warnings, red errors,
 * grey frozen) with the
 * number of issues in words; click it for the list (layer + what happened), shown inside the card. Export progress is not shown here.
 */
import type { Health } from '@smart-canvas/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NO_CANVAS } from './pinch';


export function healthSummary(h: Health): string {
  const n = h.issues.length;
  if (h.level === 'error') return `${n} ${n === 1 ? 'problem' : 'problems'}`;
  if (h.level === 'warning') return `${n} ${n === 1 ? 'warning' : 'warnings'}`;
  if (h.level === 'empty') return `${n} empty ${n === 1 ? 'layer' : 'layers'}`;
  if (h.level === 'frozen') return 'Frozen: disconnected, layout no longer follows the Layer Comp';
  return 'Layout OK';
}

/** A level's colours: on the badge (ok and frozen stay quiet) and in the inspector's summary pill. */
export const HEALTH_TONE: Record<Health['level'], string> = {
  ok: '',
  warning: 'bg-warn-soft text-warn',
  error: 'bg-danger-soft text-danger',
  frozen: '',
  empty: 'bg-surface-2 text-muted',
};
export const HEALTH_PILL: Record<Health['level'], string> = { ...HEALTH_TONE, ok: 'bg-ok-soft text-ok', frozen: 'bg-surface-2 text-muted' };
/** The dot: green when fine, the level's colour otherwise; an empty ring for empty layers (a to-do, D64). */
const DOT: Record<Health['level'], string> = {
  ok: 'bg-type-output',
  warning: 'bg-warn',
  error: 'bg-danger',
  frozen: 'bg-faint',
  empty: 'bg-transparent [box-shadow:inset_0_0_0_1.5px_var(--muted)]',
};
/** UX A6 (F7, F18): the count says what it counts ("2 empty", "1 warning"), on a 24 px target. */
const BADGE =
  'inline-flex h-24 min-w-24 cursor-default items-center gap-5 rounded-[99px] px-8 py-0 text-xs font-[600] [font-variant-numeric:tabular-nums] [border:0] [&[aria-expanded]]:cursor-pointer';
/** The issues list, inside the card under its header (UX A6: a pop-up was cut off by the cards around it). */
export const ISSUES_IN_CARD =
  'sc-health__list m-0 grid list-none gap-2 p-0 text-xs [&_strong]:block [&_strong]:font-[600] [&>li]:rounded-sm [&>li]:bg-surface-2 [&>li]:px-(--sp-2) [&>li]:py-6 [&>li]:[border-left:3px_solid_var(--warn)] [&>li[data-level=error]]:[border-left-color:var(--danger)] [&>li[data-level=todo]]:[border-left-color:var(--faint)]';

/** The badge's short word for its count. */
function countWord(h: Health, n: number): string {
  if (h.level === 'error') return n === 1 ? 'problem' : 'problems';
  if (h.level === 'warning') return n === 1 ? 'warning' : 'warnings';
  return 'empty';
}

/**
 * A card's health: the badge for its header and, while the badge is open, the list for under the header. Escape or a
 * click outside the card closes it.
 */
export function useHealth(health: Health | null | undefined): { badge: ReactNode; list: ReactNode } {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const count = health?.issues.length ?? 0;
  const shown = open && count > 0;
  useEffect(() => {
    if (!shown) return;
    const card = root.current?.closest('.react-flow__node') ?? root.current;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !card?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [shown]);
  if (!health) return { badge: null, list: null };
  const summary = healthSummary(health);
  const badge = (
    <span ref={root} className={`sc-health relative inline-flex flex-none ${NO_CANVAS}`} data-health={health.level}>
      <button
        type="button"
        className={`sc-health__btn sc-health--${health.level} ${BADGE} ${HEALTH_TONE[health.level] || '[background:none]'}`}
        aria-label={`Layout health: ${summary}`}
        aria-expanded={count ? shown : undefined}
        title={summary}
        onClick={() => count && setOpen((o) => !o)}
      >
        <span className={`sc-health__dot size-8 rounded-[50%] ${DOT[health.level]}`} aria-hidden="true" />
        {count > 0 && <span className="sc-health__count">{count} {countWord(health, count)}</span>}
      </button>
    </span>
  );
  return { badge, list: shown ? <HealthIssues health={health} className={`${ISSUES_IN_CARD} ${NO_CANVAS}`} /> : null };
}

/** The issues, one per layer and kind (the badge's pop-up and the inspector's list). */
export function HealthIssues({ health, className }: { health: Health; className: string }) {
  return (
    <ul className={className} aria-label="Layout issues">
      {health.issues.map((i) => (
        <li key={`${i.sourceId}:${i.code}`} data-level={i.level}>
          <strong>{i.label}</strong> {i.message}
        </li>
      ))}
    </ul>
  );
}

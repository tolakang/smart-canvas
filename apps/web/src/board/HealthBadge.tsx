/**
 * Layout health on a node (D35): a status dot (green ok, grey empty layers to fill (D64), amber warnings, red errors,
 * grey frozen) with the
 * number of issues; click it for the list (layer + what happened). Export progress is not shown here.
 */
import type { Health } from '@smart-canvas/core';
import { useEffect, useRef, useState } from 'react';

const NO_CANVAS = 'nodrag nopan nowheel';

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
const BADGE =
  'inline-flex h-20 min-w-20 cursor-default items-center gap-4 rounded-[99px] px-6 py-0 text-xs font-[600] [font-variant-numeric:tabular-nums] [border:0] [&[aria-expanded]]:cursor-pointer';
/** The issues pop-up under a badge. */
export const ISSUES_POPUP =
  'sc-health__list absolute top-[calc(100%+6px)] right-0 z-20 m-0 grid w-240 list-none gap-2 rounded-md border border-line bg-surface p-(--sp-1) text-xs [box-shadow:var(--shadow-2)] [&_strong]:block [&_strong]:font-[600] [&>li]:rounded-sm [&>li]:bg-surface-2 [&>li]:px-(--sp-2) [&>li]:py-6 [&>li]:[border-left:3px_solid_var(--warn)] [&>li[data-level=error]]:[border-left-color:var(--danger)] [&>li[data-level=todo]]:[border-left-color:var(--faint)]';

export function HealthBadge({ health }: { health: Health }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const summary = healthSummary(health);
  const count = health.issues.length;
  return (
    <span ref={root} className={`sc-health relative inline-flex flex-none ${NO_CANVAS}`} data-health={health.level}>
      <button
        type="button"
        className={`sc-health__btn sc-health--${health.level} ${BADGE} ${HEALTH_TONE[health.level] || '[background:none]'}`}
        aria-label={`Layout health: ${summary}`}
        aria-expanded={count ? open : undefined}
        title={summary}
        onClick={() => count && setOpen((o) => !o)}
      >
        <span className={`sc-health__dot size-8 rounded-[50%] ${DOT[health.level]}`} aria-hidden="true" />
        {count > 0 && <span className="sc-health__count">{count}</span>}
      </button>
      {open && count > 0 && <HealthIssues health={health} className={ISSUES_POPUP} />}
    </span>
  );
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

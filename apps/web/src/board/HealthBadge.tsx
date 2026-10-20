/**
 * Layout health on a node (D35): a status dot (green ok, amber warnings, red errors, grey frozen) with the
 * number of issues; click it for the list (layer + what happened). Export progress is not shown here.
 */
import type { Health } from '@smart-canvas/core';
import { useEffect, useRef, useState } from 'react';

const NO_CANVAS = 'nodrag nopan nowheel';

export function healthSummary(h: Health): string {
  const n = h.issues.length;
  if (h.level === 'error') return `${n} ${n === 1 ? 'problem' : 'problems'}`;
  if (h.level === 'warning') return `${n} ${n === 1 ? 'warning' : 'warnings'}`;
  if (h.level === 'frozen') return 'Frozen: disconnected, layout no longer follows the main preview';
  return 'Layout OK';
}

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
    <span ref={root} className={`sc-health ${NO_CANVAS}`} data-health={health.level}>
      <button
        type="button"
        className={`sc-health__btn sc-health--${health.level}`}
        aria-label={`Layout health: ${summary}`}
        aria-expanded={count ? open : undefined}
        title={summary}
        onClick={() => count && setOpen((o) => !o)}
      >
        <span className="sc-health__dot" aria-hidden="true" />
        {count > 0 && <span className="sc-health__count">{count}</span>}
      </button>
      {open && count > 0 && <HealthIssues health={health} className="sc-health__list" />}
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

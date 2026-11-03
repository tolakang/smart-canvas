/**
 * The app's buttons and small labels as Tailwind classes (clean-up 2, K3 / T9a; they were `.sc-btn` and friends in
 * styles.css). One function builds a button's whole class list, so no two of its utilities set the same property:
 * the kind gives the colours, the place gives what the old context rules gave (a card's taller buttons, a node's
 * rounder ones), and `slots` replace a part outright (a bigger height, a wider padding) instead of adding a second
 * utility for it. The `sc-` classes stay first: the browser tests find buttons by them.
 */

/** Default (bordered), ghost (text only, accent), danger (red text), primary (accent fill), the solid red of a
 * destructive confirm, quiet (no border, a grey tint on hover) and soft (accent tint, the asset nodes' Add). */
export type BtnKind = 'default' | 'ghost' | 'ghost-danger' | 'danger' | 'primary' | 'danger-solid' | 'quiet' | 'soft';
/** Where the button sits: in a card or dialog (32 px, 40 on phones), a node (rounder), a list row (ghost buttons in
 * the text colour), the inspector's overview (34 px, centred), or anywhere else. */
export type BtnPlace = 'plain' | 'card' | 'node' | 'row' | 'card-row' | 'overview';
/** Parts a button may replace: each slot is one property (or one group of them) the button sets once. */
export interface BtnSlots {
  display?: string;
  h?: string;
  px?: string;
  gap?: string;
  text?: string;
  round?: string;
  weight?: string;
  shadow?: string;
}

const KIND_CLASS: Record<BtnKind, string> = {
  default: 'sc-btn',
  ghost: 'sc-btn sc-btn--ghost',
  'ghost-danger': 'sc-btn sc-btn--ghost sc-btn--danger',
  danger: 'sc-btn sc-btn--danger',
  primary: 'sc-btn sc-btn--primary',
  'danger-solid': 'sc-btn sc-btn--danger-solid',
  quiet: 'sc-btn sc-btn--quiet',
  soft: 'sc-btn sc-btn--soft',
};

const PRIMARY_SHADOW = '[box-shadow:0_1px_2px_rgb(16_24_40/0.12),inset_0_1px_0_rgb(255_255_255/0.12)]';

/** Each kind's face: border, background and their hover; its text colour; and what it changes in the shared parts. */
const FACE: Record<BtnKind, { face: string; color: string; px?: string; weight?: string; shadow?: string }> = {
  default: { face: 'border-line-strong bg-surface [&:hover:not(:disabled)]:bg-surface-2', color: 'text-fg' },
  ghost: { face: 'border-transparent [background:none] [&:hover:not(:disabled)]:bg-accent-soft', color: 'text-accent', px: 'px-(--sp-2)' },
  'ghost-danger': { face: 'border-transparent [background:none] [&:hover:not(:disabled)]:bg-danger-soft', color: 'text-danger', px: 'px-(--sp-2)' },
  danger: { face: 'border-line-strong bg-surface [&:hover:not(:disabled)]:bg-danger-soft', color: 'text-danger' },
  primary: {
    face: 'border-accent bg-accent [&:hover:not(:disabled)]:border-accent-hover [&:hover:not(:disabled)]:bg-accent-hover',
    color: 'text-on-accent',
    weight: 'font-[600]',
    shadow: PRIMARY_SHADOW,
  },
  'danger-solid': {
    face: 'border-danger bg-danger [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--danger)_88%,black)]',
    color: 'text-on-accent',
    weight: 'font-[600]',
  },
  quiet: { face: 'border-transparent bg-transparent [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]', color: 'text-fg' },
  soft: {
    face: 'border-transparent bg-accent-soft [&:hover:not(:disabled)]:border-transparent [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] [&:hover:not(:disabled)]:text-accent-hover',
    color: 'text-accent',
    weight: 'font-[600]',
  },
};

/** What every button shares: a row of icon and label, one border, the accent ring on focus, a soft press. */
const SHARED =
  'items-center justify-center border border-solid py-0 leading-none no-underline cursor-pointer [transition:background_var(--t-fast),border-color_var(--t-fast),box-shadow_var(--t-fast),transform_var(--t-fast)] focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1 [&:active:not(:disabled)]:[transform:translateY(0.5px)] disabled:cursor-not-allowed disabled:opacity-50 [&_.sc-icon]:m-0';

/** A button's classes. Extra classes the caller adds must not set a property a slot covers; replace the slot instead. */
export function btn(kind: BtnKind = 'default', place: BtnPlace = 'plain', slots: BtnSlots = {}): string {
  const f = FACE[kind];
  const inCard = place === 'card' || place === 'card-row';
  // A plain ghost button in a list row takes the text colour (its red sibling stays red).
  const color = (place === 'row' || place === 'card-row') && kind === 'ghost' ? 'text-fg' : f.color;
  const s: Required<BtnSlots> = {
    display: 'inline-flex',
    h: inCard ? 'h-32 max-md:h-40' : place === 'overview' && kind === 'primary' ? 'h-34' : 'h-(--field-h)',
    px: f.px ?? 'px-(--sp-3)',
    gap: place === 'overview' && kind === 'primary' ? 'gap-(--sp-2)' : 'gap-(--sp-1)',
    text: inCard ? 'text-md' : 'text-sm',
    round: place === 'node' ? 'rounded-[9px]' : 'rounded-md',
    weight: f.weight ?? '',
    shadow: f.shadow ?? '',
    ...slots,
  };
  return [KIND_CLASS[kind], s.display, s.h, s.px, s.gap, s.text, s.round, s.weight, s.shadow, SHARED, f.face, color].filter(Boolean).join(' ');
}

/** A small square icon button (close, collapse, row actions): no frame, muted, darker on hover; 44 px on touch. A
 * button that differs passes its own size, radius, background or transition instead of adding a second one. */
export function iconBtn(slots: { size?: string; round?: string; bg?: string; hoverBg?: string; transition?: string } = {}): string {
  const s = {
    size: 'size-24',
    round: 'rounded-sm',
    bg: '[background:none]',
    hoverBg: '[&:hover:not(:disabled)]:bg-surface-2',
    transition: '[transition:background_var(--t-fast),color_var(--t-fast)]',
    ...slots,
  };
  return `sc-icon-btn inline-grid place-items-center p-0 leading-[1.4] text-muted [border:0] ${s.size} ${s.round} ${s.bg} ${s.hoverBg} ${s.transition} [&:hover:not(:disabled)]:border-transparent [&:hover:not(:disabled)]:text-fg pointer-coarse:min-h-44 pointer-coarse:min-w-44`;
}

/** A small rounded label: View only, Team, Admin. */
export const BADGE = 'sc-badge rounded-[99px] bg-line px-8 py-2 text-[12px]';

/** A small amber pill (a Preview's hand-edits count). */
export const CHIP = 'sc-chip inline-flex h-20 items-center rounded-[99px] bg-warn-soft px-(--sp-2) text-xs font-[500] text-warn';

/** The busy spinner (uploads, exports): an accent ring turning. */
export const SPINNER =
  'sc-spinner size-16 rounded-[50%] border-2 border-solid border-t-accent [border-right-color:color-mix(in_srgb,var(--accent)_25%,transparent)] [border-bottom-color:color-mix(in_srgb,var(--accent)_25%,transparent)] [border-left-color:color-mix(in_srgb,var(--accent)_25%,transparent)] [animation:sc-spin_0.8s_linear_infinite]';

/** A short notice at the bottom of the page (the projects home). */
export const TOAST =
  'sc-toast fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-1/2 z-70 m-0 rounded-md bg-fg px-14 py-8 text-sm text-surface [box-shadow:var(--shadow-2)] [transform:translateX(-50%)]';

/**
 * Owner, 2026-11-03 ("Add headline button are not consistent, need to make it prominent and consistent through all"):
 * the one Add button of the asset nodes — Add logo set, Add headline, Add text — full width, 40 px (44 on touch), soft accent.
 */
export const ADD_BUTTON = `${btn('soft', 'node', { display: 'flex', gap: 'gap-6', h: 'h-40 pointer-coarse:h-44', text: 'text-[13px]', round: 'rounded-[12px]' })} w-full`;

/**
 * The card every board node shares, as Tailwind classes (P28 T4b): a white, rounded card with a soft shadow, a lift
 * when hovered and an accent glow when selected (React Flow's `.react-flow__node:hover` / `.selected`); its header
 * (NodeHead: a kind tile, the name over a quiet line, actions, one ⋯ menu) and the fields inside it.
 * `_` in a class is a space, so a selector naming `react-flow__node` is written with `\_` (String.raw).
 */

export type CardKind = 'input' | 'main' | 'rule' | 'preset' | 'output';

/**
 * Fields in a card look like the node controls: filled, small type, a clear border, never wider than the card.
 * As before, a text field keeps that look on hover and focus (its resting rule outweighed them); a dropdown or a text
 * area shows a darker border on hover and the accent border and a white fill on focus; a file, radio or checkbox
 * input takes the hover and focus colours; a colour well is a small framed square.
 */
const FIELDS = [
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:max-w-full',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:min-w-0',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-family:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-style:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-weight:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-variant:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-stretch:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[line-height:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-feature-settings:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-kerning:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-variation-settings:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-optical-sizing:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-size-adjust:inherit]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-size:var(--fs-sm)]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[border-width:1px]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[border-style:solid]',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:rounded-md',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:text-fg',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[transition:border-color_var(--t-fast),background_var(--t-fast)]',
  // UX A3 (F8): a field shows its edge (3:1 against the card, WCAG 1.4.11), not only its fill; hover darkens it.
  '[&_input:not([type=radio],[type=checkbox],[type=color],[type=file]):not(:hover):not(:focus)]:border-line-strong',
  '[&_input:not([type=radio],[type=checkbox],[type=color],[type=file]):hover:not(:focus)]:border-muted',
  '[&_input:not([type=radio],[type=checkbox],[type=color],[type=file])]:bg-surface-2',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:h-(--field-h)',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:px-(--sp-2)',
  '[&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:py-0',
  '[&_select]:w-full',
  '[&_:is(select,textarea):not(:hover):not(:focus)]:border-line-strong',
  '[&_:is(select,textarea):hover:not(:focus)]:border-muted',
  '[&_:is(select,textarea):focus]:border-accent',
  '[&_:is(select,textarea):not(:focus)]:bg-surface-2',
  '[&_:is(select,textarea):focus]:bg-surface',
  '[&_input:is([type=radio],[type=checkbox],[type=file]):hover:not(:focus)]:border-line-strong',
  '[&_input:is([type=radio],[type=checkbox],[type=file]):focus]:border-accent',
  '[&_input:is([type=radio],[type=checkbox],[type=file]):focus]:bg-surface',
  '[&_:is(input,select,textarea):focus]:[outline:none]',
  '[&_input[type=color]]:size-(--field-h)',
  '[&_input[type=color]]:p-2',
  '[&_input[type=color]]:border',
  '[&_input[type=color]]:border-line',
  '[&_input[type=color]]:rounded-md',
  '[&_input[type=color]]:bg-surface',
].join(' ');

const HOVER = String.raw`[.react-flow\_\_node:hover:not(.selected)_&]:[box-shadow:0_2px_4px_rgb(16_24_40/0.06),0_14px_28px_-10px_rgb(16_24_40/0.22)]`;
const SELECTED = String.raw`[.react-flow\_\_node.selected_&]:border-accent [.react-flow\_\_node.selected_&]:[box-shadow:0_0_0_2px_var(--accent),0_0_0_7px_var(--ring),0_14px_28px_-10px_rgb(16_24_40/0.22)]`;

/** The thin type stripe on top: hidden since V1, kept for its colour per kind. */
const STRIPE: Record<CardKind, string> = {
  input: 'before:bg-type-input',
  main: 'before:bg-type-main',
  rule: 'before:bg-type-input',
  preset: 'before:bg-type-input',
  output: 'before:bg-type-output',
};
const SIZE: Record<CardKind, string> = {
  input: 'w-280 min-w-[160px]',
  main: 'w-280 min-w-260 min-h-120',
  rule: 'w-280 min-w-[160px]',
  preset: 'w-300 min-w-[160px]',
  output: 'w-280 min-w-[160px]',
};

/**
 * A card: its kind sets the width and the stripe; `frozen` (a disconnected Preview) is dashed and grey, `hidden` (an
 * input hidden everywhere) faded, `drop` (a file dragged over it) outlined.
 */
export function cardClass(kind: CardKind, state: { frozen?: boolean; hidden?: boolean; drop?: boolean } = {}) {
  return [
    `sc-node sc-node--${kind}`,
    state.frozen && 'sc-node--frozen',
    state.hidden && 'sc-node--hidden opacity-50',
    state.drop && 'sc-node--drop [outline:2px_dashed_var(--accent)] outline-offset-2',
    'relative grid grid-cols-[minmax(0,1fr)] gap-14 rounded-[20px] border bg-surface p-16 [&>*]:min-w-0',
    '[box-shadow:0_1px_2px_rgb(16_24_40/0.06),0_6px_16px_-6px_rgb(16_24_40/0.12)] [transition:box-shadow_var(--t-fast),border-color_var(--t-fast)]',
    state.frozen ? 'border-line-strong [border-style:dashed] before:bg-line-strong' : `border-[color-mix(in_srgb,var(--line)_90%,transparent)] ${STRIPE[kind]}`,
    "before:absolute before:top-[-1px] before:right-[-1px] before:left-[-1px] before:hidden before:h-3 before:rounded-t-lg before:content-['']",
    SIZE[kind],
    HOVER,
    SELECTED,
    FIELDS,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The header (V1): its kind's colour is `--head` (`tone`), a soft gradient of it across the card's top. */
export const HEAD =
  'sc-node__head sc-head relative mx-[-16px] mt-[-16px] mb-0 flex min-h-64 items-center gap-12 rounded-t-[20px] pt-14 pr-12 pb-14 pl-16 [border-bottom:1px_solid_color-mix(in_srgb,var(--line)_70%,transparent)] [background:linear-gradient(180deg,color-mix(in_srgb,var(--head)_12%,var(--surface)),color-mix(in_srgb,var(--head)_4%,var(--surface)))]';
export const HEAD_ICON =
  'sc-head__icon grid size-34 flex-none place-items-center rounded-[11px] [color:white] [background:linear-gradient(140deg,color-mix(in_srgb,var(--head)_78%,white),var(--head))] [box-shadow:0_4px_10px_-3px_color-mix(in_srgb,var(--head)_60%,transparent),inset_0_1px_0_rgb(255_255_255/0.3)]';
export const HEAD_TEXT = 'sc-head__text grid min-w-0 flex-1 gap-2';
export const HEAD_TITLE =
  'sc-node__title sc-head__title flex-1 overflow-hidden text-[14.5px] leading-[1.25] font-[680] tracking-[-0.015em] text-ellipsis whitespace-nowrap';
export const HEAD_SUB = 'sc-head__sub overflow-hidden text-[12px] leading-[1.3] text-ellipsis whitespace-nowrap text-muted';
export const HEAD_MORE =
  'sc-head__more grid size-32 flex-none cursor-pointer place-items-center rounded-[10px] bg-transparent p-0 text-muted [border:0] [transition:background_var(--t-fast),color_var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg aria-expanded:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] aria-expanded:text-fg pointer-coarse:size-44';
/** A header action (Edit, Export): tinted in the card's colour. */
export const HEAD_ACTION =
  'sc-head__action inline-flex h-32 flex-none cursor-pointer items-center gap-6 rounded-[10px] bg-[color-mix(in_srgb,var(--head)_14%,var(--surface))] px-12 py-0 text-[12.5px] font-[650] text-[color-mix(in_srgb,var(--head)_65%,var(--fg))] [border:0] [transition:background_var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--head)_24%,var(--surface))] pointer-coarse:h-40 pointer-coarse:px-14';
/** A mark in the header (hidden, from the library). */
export const HEAD_MARK = 'sc-node__mark grid flex-none place-items-center text-muted';

/** The quiet line under a card's content (also under the inspector's export size). */
export const META = 'sc-node__meta text-xs leading-[1.5] text-muted';

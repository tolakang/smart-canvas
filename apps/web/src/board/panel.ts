/**
 * The board's side panels as Tailwind classes (P28 T3b): the inspector, History and Review. On a wide screen they sit
 * beside the canvas on the glass backdrop; on a tablet they float over it (overlay), on a phone they are a bottom
 * sheet. Also the inspector's sections and the project overview it shows with nothing selected.
 */

/**
 * The fields inside a panel get the node field look (the inspector reuses the node controls): filled, small type, a
 * clear border, never wider than the panel. It holds on focus too (the ring comes from styles.css); the lighter focus
 * rule only reaches the other inputs (checkboxes, colour, file).
 */
const FIELDS =
  'text-sm [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:max-w-full [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:min-w-0 [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-family:inherit] [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[font-feature-settings:inherit] [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:[line-height:inherit] [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:text-sm [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:text-fg [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:bg-surface-2 [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select,textarea)]:border-transparent [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:h-(--field-h) [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:w-full [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:px-(--sp-2) [&_:is(input:not([type=radio],[type=checkbox],[type=color],[type=file]),select)]:py-0 [&_:where(input,select,textarea):focus]:border-accent [&_:where(input,select,textarea):focus]:bg-surface [&_:where(input,select,textarea):focus]:[outline:none]';

/** A side panel: `floating` is how it shows on a tablet ('overlay') or a phone ('sheet'); docked otherwise. */
export function panelClass(floating: 'overlay' | 'sheet' | undefined, extra = '') {
  const where =
    floating === 'overlay'
      ? 'sc-floating sc-floating--overlay sc-floating--end absolute top-(--sp-2) right-(--sp-2) bottom-(--sp-2) z-30 w-300 max-w-[calc(100%-16px)] rounded-lg border border-line bg-surface [box-shadow:var(--shadow-3)]'
      : floating === 'sheet'
        ? "sc-floating sc-floating--sheet sc-floating--end fixed right-0 bottom-0 left-0 z-30 max-h-[62dvh] rounded-t-lg [border-color:var(--line)_currentcolor_currentcolor_var(--line)] [border-style:solid_none_none_solid] [border-width:1px_0_0_1px] bg-surface pb-[env(safe-area-inset-bottom)] [box-shadow:var(--shadow-3)] before:mx-auto before:mt-6 before:mb-0 before:block before:h-4 before:w-36 before:rounded-[2px] before:bg-line-strong before:content-['']"
        : 'w-320 rounded-(--panel-r) border border-[color-mix(in_srgb,var(--line)_80%,transparent)] bg-glass [backdrop-filter:blur(16px)] [box-shadow:var(--shadow-2)]';
  return `sc-inspector-panel${extra ? ` ${extra}` : ''} flex-none overflow-auto ${where} ${FIELDS}`;
}

/** The floating panel's title row (Inspector, History, Review) with its Close button. */
export const PANEL_HEAD =
  'sc-floating__head sticky top-0 z-1 flex items-center justify-between py-(--sp-2) pr-(--sp-2) pl-(--sp-4) font-[600] bg-surface [border-bottom:1px_solid_var(--line)]';

/** A section of a panel, with a soft line under all but the last. */
export const SECTION =
  'sc-inspector-panel__section grid gap-(--sp-2) px-(--sp-4) py-(--sp-3) [border-bottom:1px_solid_color-mix(in_srgb,var(--line)_70%,transparent)] last:[border-bottom:0]';
/** A section's title row: the name, and a button or a badge on the right. */
export const SECTION_TITLE = 'sc-inspector-panel__title flex min-h-(--field-h) items-center justify-between gap-(--sp-2) text-sm font-[600]';
export const HINT = 'sc-inspector-panel__hint m-0 text-xs leading-[1.5]';
export const FORM = 'sc-inspector-panel__form grid gap-(--sp-2)';
export const ACTIONS = 'sc-inspector-panel__actions flex flex-wrap gap-(--sp-2)';

/** Layout health: the summary pill and the list of issues, each with a coloured edge for its level. */
export const LEVEL = 'sc-inspector-panel__level rounded-[99px] px-(--sp-2) py-2 text-xs font-[600]';
export const ISSUES =
  'sc-inspector-panel__issues m-0 grid list-none gap-4 p-0 text-xs [&_strong]:block [&>li]:rounded-sm [&>li]:bg-surface-2 [&>li]:px-(--sp-2) [&>li]:py-6 [&>li]:[border-left:3px_solid_var(--warn)] [&>li[data-level=error]]:[border-left-color:var(--danger)] [&>li[data-level=todo]]:[border-left-color:var(--faint)]';

/** The project overview: the name, three counts and tips for adding to the board. */
export const OVERVIEW_NAME = 'sc-overview__name overflow-hidden text-lg font-[650] text-ellipsis whitespace-nowrap';
export const STATS = 'sc-overview__stats my-(--sp-1) grid grid-cols-[repeat(3,1fr)] gap-(--sp-2)';
export const STAT = 'rounded-md border border-line bg-surface-2 px-(--sp-3) py-(--sp-2)';
export const STAT_LABEL = 'text-xs text-muted';
export const STAT_VALUE = 'text-xl font-[650] [font-variant-numeric:tabular-nums] [margin:2px_0_0]';
export const TIPS = 'sc-overview__tips m-0 grid list-none gap-(--sp-2) p-0 text-sm leading-[1.5] text-muted';
export const TIP_KEY = 'font-[600] text-fg';

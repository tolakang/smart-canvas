/**
 * The board's top bar and its menus as Tailwind classes (P28 T3a): floating glass groups on the board's backdrop —
 * Back, the name, Undo / Redo; + Add; save status, Assets, History, Review, theme, side panel and Export.
 * State rules use arbitrary variants (`[&:hover:not(:disabled)]:`) where the old selectors' weight decided which of
 * two states won (hover beats pressed), so the same one still does.
 */

/** The bar: three columns, so the + Add group stays centred. */
export const TOPBAR =
  'sc-board__bar sc-topbar grid h-60 min-h-60 grid-cols-[1fr_auto_1fr] items-center gap-(--sp-3) bg-transparent px-12 pt-10 pb-0 text-sm [border-bottom:0] max-md:h-54 max-md:min-h-54 max-md:gap-(--sp-1) max-md:px-6 max-md:pt-6';

const GROUP =
  'sc-topbar__group flex h-44 min-w-0 items-center rounded-[14px] border border-[color-mix(in_srgb,var(--line)_80%,transparent)] bg-glass [backdrop-filter:blur(16px)_saturate(1.4)] [box-shadow:var(--shadow-2)] empty:hidden';
/** Back, the project's name, Undo / Redo. */
export const GROUP_START = `${GROUP} max-w-full gap-(--sp-1) px-6 [justify-self:start]`;
/** + Add, in the middle. */
export const GROUP_ADD = `${GROUP} sc-topbar__add gap-2 px-4 py-0`;
/** Save status, the tools and Export; it stays right when the middle group is hidden (phone). */
export const GROUP_END = `${GROUP} sc-topbar__end justify-end gap-(--sp-1) px-6 [grid-column:3] [justify-self:end]`;

/** What every button in the bar shares: a quiet face, a soft tint on hover, the accent ring on focus. */
const BUTTON =
  'inline-flex items-center gap-6 text-sm whitespace-nowrap [transition:background_var(--t-fast),border-color_var(--t-fast),box-shadow_var(--t-fast),transform_var(--t-fast)] [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] disabled:cursor-default focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1';

/** An icon button (Back, Undo, History…): muted, darker on hover; pressed ones are tinted. */
export const ICON = `sc-topbar__icon ${BUTTON} size-34 justify-center rounded-[10px] p-0 font-[500] text-muted [background:none] [border:0] aria-pressed:bg-accent-soft [&:hover:not(:disabled)]:text-fg max-md:relative pointer-coarse:min-h-44 pointer-coarse:min-w-44`;

/** A text button with an icon (Assets); only the icon at 1100 px and narrower. */
export const GHOST = `sc-topbar__ghost ${BUTTON} h-32 rounded-md px-(--sp-3) py-0 font-[500] text-muted [background:none] [border:0] [&:hover:not(:disabled)]:text-fg max-xl:w-32 max-xl:justify-center max-xl:gap-0 max-xl:p-0 max-xl:text-[length:0px]`;

/** + Add: the dark pill in the middle (its hover is the bar's soft tint, as before). */
export const ADD = `${BUTTON} h-34 rounded-[10px] bg-fg px-16 py-0 font-[600] text-bg [border:0] [&:hover:not(:disabled)]:[box-shadow:var(--shadow-1)]`;

/** Export: the accent button; only its icon on phones, with a larger tap area. */
export const PRIMARY = `sc-topbar__primary ${BUTTON} ml-(--sp-1) h-34 rounded-[10px] bg-accent px-16 py-0 font-[500] text-on-accent [border:0_none_var(--accent)] [box-shadow:0_1px_2px_rgb(16_24_40/0.12),inset_0_1px_0_rgb(255_255_255/0.12)] [&:hover:not(:disabled)]:border-accent-hover disabled:bg-accent-soft disabled:text-topbar-primary-disabled pointer-coarse:min-h-44 max-md:relative max-md:w-36 max-md:min-h-36! max-md:justify-center max-md:gap-0! max-md:p-0! max-md:text-[length:0px]! max-md:after:absolute max-md:after:-inset-4 max-md:after:content-['']`;

/** The project's name. */
export const NAME =
  'sc-topbar__name max-w-[280px] overflow-hidden px-(--sp-1) text-[14px] font-[650] tracking-[-0.01em] text-ellipsis whitespace-nowrap max-md:min-w-0 max-md:max-w-[40vw]';
/** A thin divider between buttons. */
export const SEP = 'sc-topbar__sep mx-(--sp-1) h-20 w-1 flex-none bg-line';
/** "3 inputs · 2 outputs" for viewers. */
export const COUNTS = 'sc-muted sc-topbar__counts text-xs';
/** Open comments on the Review button. */
export const COUNT =
  'sc-topbar__count absolute top-2 right-2 h-15 min-w-15 rounded-[8px] bg-accent px-4 text-center text-[9px] leading-[15px] font-[700] text-on-accent';

/** The save status: a dot and a word ("Saved"), a shorter word at 1100 px and narrower. */
export function saveClass(state: string) {
  const bad = state === 'error' || state === 'conflict';
  return `sc-save sc-save--${state} ml-0 flex items-center gap-6 px-6 text-xs whitespace-nowrap ${bad ? 'text-danger' : 'text-muted'}`;
}
export function saveDotClass(state: string) {
  const tone = state === 'error' || state === 'conflict' ? 'bg-danger' : state === 'pending' || state === 'saving' ? 'bg-warn' : 'bg-type-output';
  return `sc-save__dot size-6 flex-none rounded-[50%] ${tone}`;
}
export const SAVE_LONG = 'sc-save__long max-xl:hidden';
export const SAVE_SHORT = 'sc-save__short hidden max-xl:inline';
/** Reload latest, after a conflict. */
export const SAVE_BUTTON = `${BUTTON} h-24 rounded-md border border-line-strong px-(--sp-3) py-0 font-[500] text-fg [background:none]`;

/** A menu: the + Add menu, a node's ⋯ menu, the right-click menu, the Projects ⋯ menu. */
export const MENU = 'sc-menu fixed z-60 grid min-w-200 rounded-lg border border-line bg-surface p-4 [box-shadow:var(--shadow-3)]';
export const MENU_TITLE = 'sc-menu__title px-10 pt-6 pb-4 text-[11px] tracking-[0.04em] text-muted uppercase';
export function menuItemClass(danger: boolean, separated: boolean) {
  return [
    'sc-menu__item px-10 py-6 text-left text-[13px] [background:none] pointer-coarse:min-h-44',
    separated
      ? 'sc-menu__item--sep mt-4 rounded-[0_0_5px_5px] [border-color:var(--line)_currentcolor_currentcolor] [border-style:solid_none_none] [border-width:1px_0_0]'
      : 'rounded-[5px] [border:0]',
    danger ? 'sc-menu__item--danger text-danger' : '',
    'disabled:text-muted [&:hover:not(:disabled)]:bg-input focus-visible:bg-input focus-visible:[outline:none]',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The board screen's frame as Tailwind classes (P28 T3b): the ambient backdrop, the canvas row (the board and a docked
 * side panel), the board's glass card, and its notices — the Tidy undo notice and the banner of a version shown
 * read-only — and what floats on the canvas: the selection bar and the alignment guides.
 */

/** The visible height (dvh), not 100vh: on phones 100vh is taller than the screen while the browser's address bar and
 *  bottom bar show, which pushed the top bar or the canvas toolbar out of view. The page itself never scrolls. */
export const BOARD =
  'sc-board flex h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-0 pl-[env(safe-area-inset-left)] [background:var(--ambient)]';
export const CANVAS = 'sc-board__canvas relative flex min-h-0 flex-1 gap-12 px-12 pt-10 pb-12 max-md:p-6';
/** The board itself: a glass card on the backdrop (darker glass in the dark theme). */
export const FLOW =
  'sc-board__flow relative min-w-0 flex-1 overflow-hidden rounded-(--panel-r) border border-[color-mix(in_srgb,var(--line)_80%,transparent)] bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] [box-shadow:inset_0_1px_0_rgb(255_255_255/0.5),var(--shadow-1)] dark:bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] dark:[box-shadow:var(--shadow-1)] max-md:rounded-[14px]';

/** The notice at the bottom of the board ("Board tidied · Undo"): dark, with an underlined action. */
export const TOAST =
  'sc-board__toast mb-72 flex items-center gap-(--sp-3) rounded-md bg-fg py-6 pr-6 pl-14 text-sm text-surface [box-shadow:var(--shadow-2)]';
export const TOAST_BUTTON =
  'min-h-32 rounded-sm bg-transparent px-12 py-0 text-[length:inherit] [line-height:inherit] font-[600] [color:inherit] underline [border:0] hover:bg-[color-mix(in_srgb,var(--surface)_15%,transparent)] pointer-coarse:min-h-44';

/** A version from History shown read-only: what it is, and Restore / Close. */
export const VERSION =
  'sc-board__version flex flex-wrap items-center gap-x-(--sp-3) gap-y-(--sp-2) bg-accent-soft px-12 py-6 text-sm [border-bottom:1px_solid_var(--line)]';
export const VERSION_ACTIONS = 'sc-board__version-actions ml-auto flex gap-(--sp-2)';
const VERSION_BUTTON = 'h-(--field-h) rounded-md border px-(--sp-3) py-0 text-[length:inherit] [line-height:inherit]';
export const VERSION_CLOSE = `${VERSION_BUTTON} border-line-strong bg-surface`;
export const VERSION_RESTORE = `sc-board__restore ${VERSION_BUTTON} border-accent bg-accent font-[600] text-on-accent`;

/** Two or more panels selected: a glass bar at the top to group or delete them without shortcuts. */
export const SELBAR =
  'sc-selbar flex items-center gap-(--sp-2) rounded-lg border border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] py-(--sp-1) pr-(--sp-1) pl-(--sp-3) [backdrop-filter:blur(12px)] [box-shadow:var(--shadow-2)]';
export const SELBAR_COUNT = 'sc-selbar__count text-sm text-muted [font-variant-numeric:tabular-nums]';

/** The alignment guides while a panel is dragged (T13.5): a red hairline across the whole board. */
const GUIDE = 'sc-guide pointer-events-none absolute top-0 left-0 z-1000 bg-danger';
export const GUIDE_V = `${GUIDE} sc-guide--v mt-[-50000px] h-[100000px] w-1`;
export const GUIDE_H = `${GUIDE} sc-guide--h ml-[-50000px] h-1 w-[100000px]`;

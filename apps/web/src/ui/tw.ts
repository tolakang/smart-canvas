/**
 * Tailwind class lists that several components share (P28, D65). Each keeps the element's `sc-` class first: the
 * browser tests find elements by it, and the CSS parity test draws the old CSS against it.
 */

/** A modal dialog: no frame of its own (its card has one), a dimmed and blurred page behind it. */
export const DIALOG =
  'sc-dialog border-none bg-transparent p-0 max-md:max-w-[calc(100vw-16px)] backdrop:bg-scrim backdrop:[backdrop-filter:blur(3px)]';

/** A select in a dialog takes its label's font (weight, size); its frame comes from the card's field rules. */
export const DIALOG_SELECT = '[font:inherit]';

/** A field label in the Size presets and Team dialogs' forms: a small label over its field. */
export const PRESET_FIELD = 'grid gap-2 text-[13px]';

/** The Team and Size presets cards: their own padding, smaller on phones. */
export const DIALOG_LONG_CARD = '[--card-pad:24px] max-md:[--card-pad:var(--sp-4)]';

/** A long dialog's footer: it sticks to the card's bottom edge, so Close stays in view. */
export const DIALOG_STICKY_FOOT =
  'sc-dialog__foot sticky bottom-[calc(-1*var(--card-pad))] -mx-(--sp-5) mt-0 -mb-(--sp-5) flex flex-wrap justify-end gap-(--sp-2) border-t border-t-line bg-[color-mix(in_srgb,var(--surface-2)_70%,transparent)] px-(--sp-5) py-14';

/*
 * Cards, dialogs' cards, rows, forms and fields (clean-up 2, K3 / T9b; they were `.sc-card` and friends in
 * styles.css). A card styles the plain elements inside it (headings, labels, fields, buttons without a class) with
 * zero-weight `:where()` rules, as the old CSS did from its lower layer: an element's own classes still win.
 */

/** What every card does to what it holds. */
const CARD_INSIDE = [
  // Labels: a column (a check box's label stays a row).
  '[:where(&_label:not(.sc-check))]:grid [:where(&_label:not(.sc-check))]:gap-4',
  // Fields (every input but check boxes, radios, colour, range and file pickers; selects): 32 px (40 on phones), a
  // quiet border, the accent ring on focus. Each class is written out: Tailwind reads the source text.
  '[:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:h-32 [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:min-w-0 [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:px-(--sp-2) [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:py-0 [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:border [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:border-solid [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:border-line-strong [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:bg-surface [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:text-fg [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:[font:inherit]',
  '[:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select,textarea))]:rounded-md [:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select,textarea))]:[transition:border-color_var(--t-fast),box-shadow_var(--t-fast)]',
  String.raw`[:where(&)_:is(input,select,textarea):focus-visible]:[outline:none] [:where(&)_:is(input,select,textarea):focus-visible]:border-accent [:where(&)_:is(input,select,textarea):focus-visible]:[box-shadow:0_0_0_3px_var(--ring)] [:where(&)_:is(input,select):focus-visible]:-outline-offset-1`,
  '[:where(&_input)]:placeholder:[color:color-mix(in_srgb,var(--muted)_80%,transparent)]',
  'max-md:[:where(&_:is(input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=file]),select))]:h-40 max-md:[:where(&_:is(input,select))]:text-[16px]',
  // Buttons without a class (sign in, the invite page, older dialogs) look like the app's buttons; a submit is primary.
  String.raw`[:where(&_button:not([class]))]:inline-flex [:where(&_button:not([class]))]:items-center [:where(&_button:not([class]))]:justify-center [:where(&_button:not([class]))]:h-32 [:where(&_button:not([class]))]:px-(--sp-3) [:where(&_button:not([class]))]:py-0 [:where(&_button:not([class]))]:border [:where(&_button:not([class]))]:border-solid [:where(&_button:not([class]))]:border-line-strong [:where(&_button:not([class]))]:rounded-md [:where(&_button:not([class]))]:bg-surface [:where(&_button:not([class]))]:text-fg [:where(&_button:not([class]))]:[transition:background_var(--t-fast),border-color_var(--t-fast),box-shadow_var(--t-fast),transform_var(--t-fast)]`,
  String.raw`[:where(&)_button:not([class]):hover:not(:disabled)]:bg-surface-2 [:where(&)_button:not([class]):active:not(:disabled)]:[transform:translateY(0.5px)] [:where(&)_button:not([class]):disabled]:opacity-50 [:where(&)_button:not([class]):disabled]:cursor-not-allowed`,
  String.raw`[:where(&_button[type=submit]:not([class]))]:border-accent [:where(&_button[type=submit]:not([class]))]:bg-accent [:where(&_button[type=submit]:not([class]))]:text-on-accent [:where(&_button[type=submit]:not([class]))]:font-[600] [:where(&_button[type=submit]:not([class]))]:[box-shadow:0_1px_2px_rgb(16_24_40/0.12),inset_0_1px_0_rgb(255_255_255/0.12)]`,
  String.raw`[:where(&)_button[type=submit]:not([class]):hover:not(:disabled)]:border-accent-hover [:where(&)_button[type=submit]:not([class]):hover:not(:disabled)]:bg-accent-hover`,
  '[:where(&)_button:focus-visible]:[outline:2px_solid_var(--accent)] [:where(&)_button:focus-visible]:outline-offset-1',
  String.raw`max-md:[:where(&_button:not([class]))]:h-40`,
].join(' ');

/** A card on a page (sign in, the invite page): centred, 360 px wide; a big title, section titles. */
export const CARD = [
  'sc-card [:where(&)]:mx-auto [:where(&)]:my-[10vh] [:where(&)]:grid [:where(&)]:max-w-[360px] [:where(&)]:gap-12 [:where(&)]:rounded-xl [:where(&)]:border [:where(&)]:border-solid [:where(&)]:border-line [:where(&)]:bg-surface [:where(&)]:p-24 [:where(&)]:[box-shadow:var(--shadow-1)]',
  '[:where(&_h1)]:mt-0 [:where(&_h1)]:mx-0 [:where(&_h1)]:mb-4 [:where(&_h1)]:text-xl [:where(&_h1)]:font-[650]',
  '[:where(&_h2)]:mt-(--sp-2) [:where(&_h2)]:mx-0 [:where(&_h2)]:mb-0 [:where(&_h2)]:text-lg',
  CARD_INSIDE,
].join(' ');

/** A dialog's card: up to 560 px, scrolls inside the window, a gentle entrance; small-caps section titles. */
export const DIALOG_CARD = [
  'sc-card [:where(&)]:m-0 [:where(&)]:grid [:where(&)]:w-[min(560px,calc(100vw-32px))] [:where(&)]:min-w-[min(320px,100%)] [:where(&)]:max-w-none [:where(&)]:max-h-[calc(100dvh-48px)] [:where(&)]:overflow-auto [:where(&)]:gap-(--sp-4) [:where(&)]:rounded-xl [:where(&)]:border [:where(&)]:border-solid [:where(&)]:border-line [:where(&)]:bg-surface [:where(&)]:p-(--sp-5) [:where(&)]:[box-shadow:var(--shadow-3)] [.sc-dialog[open]_&]:[animation:sc-pop_var(--t-med)_both] max-md:[--card-pad:var(--sp-4)]',
  '[:where(&_h1)]:m-0 [:where(&_h1)]:text-[20px] [:where(&_h1)]:font-[650]',
  '[:where(&_h2)]:mt-6 [:where(&_h2)]:mx-0 [:where(&_h2)]:mb-0 [:where(&_h2)]:text-[12px] [:where(&_h2)]:font-[650] [:where(&_h2)]:tracking-[0.04em] [:where(&_h2)]:uppercase [:where(&_h2)]:text-muted',
  CARD_INSIDE,
].join(' ');

/** A row of buttons (or a field and its button): side by side, a field takes the room left. */
const ROW_BASE = 'sc-row flex gap-8 [:where(&_input)]:flex-1';
/** A dialog's last row of buttons: on the right, the main action last (Cancel, then Export). */
export const DIALOG_ACTIONS = `${ROW_BASE} mt-4 flex-row-reverse justify-start`;
/** A row of buttons that ends a list item in a dialog: on the right. */
export const ROW_END = `${ROW_BASE} justify-end`;

/** A list in a dialog (members, presets, families): rows as soft cards, 8 px apart. */
export const DIALOG_LIST = 'sc-list sc-rows m-0 grid gap-8 rounded-lg p-0 [list-style:none] [border:0] overflow-visible';
/** One row of it (its alignment apart, see DIALOG_ROW): the name on the left, actions on the right (under it on phones). */
export const DIALOG_ROW_BOX = 'flex min-h-52 justify-between gap-8 rounded-[12px] border border-solid border-line bg-surface px-14 py-10 max-md:flex-wrap';
export const DIALOG_ROW = `${DIALOG_ROW_BOX} items-center`;
/** A row's name over its muted line. */
export const ROW_MAIN = 'sc-rows__main grid min-w-0 flex-1 gap-2 p-0 text-left [border:0] [background:none] [color:inherit] [font:inherit]';
export const ROW_NAME = 'sc-rows__name overflow-hidden font-[600] text-ellipsis whitespace-nowrap';
export const ROW_META = 'sc-rows__meta overflow-hidden text-sm text-ellipsis whitespace-nowrap text-muted';
export const ROW_ACTIONS = 'sc-rows__actions flex flex-none flex-wrap items-center justify-end gap-(--sp-1) max-md:ml-auto';

/** A form under a dialog's lists: a line above it, its fields in a grid that wraps, its buttons on the right. */
export const FORM = 'sc-form grid gap-(--sp-3) pt-(--sp-3) [border-top:1px_solid_var(--line)]';
export const FIELDS =
  'sc-fields grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-(--sp-3) [:where(&_label)]:grid [:where(&_label)]:min-w-0 [:where(&_label)]:gap-(--sp-1) [:where(&_label)]:text-sm [:where(&_label)]:text-muted';
export const FIELD_WIDE = 'sc-fields__wide [grid-column:1/-1]';
export const FORM_ACTIONS = 'sc-form__actions flex flex-wrap justify-end gap-(--sp-2)';
/** A short muted note under a field. */
export const HINT = 'sc-hint m-0 text-sm text-muted';

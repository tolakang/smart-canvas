/**
 * The small controls styles.css still held before Tailwind (clean-up 2, K3 / T9c): fields, check boxes, segmented
 * controls, pictures and swatches, upload labels and links, drag grips. Each constant is one element's final styles
 * (the old context rules worked out per place); the bases a caller may add to are zero-weight `:where()`, as the old
 * CSS was in a lower layer, so the caller's own classes still win. The `sc-` classes stay first for the tests.
 */

/** The checkerboard behind a picture, so transparent parts show. */
const CHECKER = '[background:repeating-conic-gradient(var(--checker-a)_0_25%,var(--checker-b)_0_50%)_0_0/16px_16px]';

/** A label and its control side by side (Colour, Angle, a gradient stop); its number and colour inputs are small. */
const FIELD_INPUTS =
  '[:where(&_input[type=number])]:w-56 [:where(&_input[type=number])]:px-4 [:where(&_input[type=number])]:py-2 [:where(&_input[type=color])]:h-24 [:where(&_input[type=color])]:w-32 [:where(&_input[type=color])]:p-0 [:where(&_input[type=color])]:border [:where(&_input[type=color])]:border-solid [:where(&_input[type=color])]:border-line [:where(&_input[type=color])]:rounded-[4px]';
export const FIELD_ROW = `sc-field [:where(&)]:flex [:where(&)]:items-center [:where(&)]:gap-6 ${FIELD_INPUTS}`;
/** A label over its control (most fields in panels and dialogs). */
export const FIELD_COL = `sc-field sc-field--col [:where(&)]:grid [:where(&)]:gap-4 [:where(&)]:[align-items:start] ${FIELD_INPUTS}`;

/** A check box (or radio) and its label on one line. */
export const CHECK = 'sc-check flex items-center gap-6';

/** A segmented control in the text panel: a bordered strip of choices. */
export const SEG = 'sc-seg [:where(&)]:inline-flex [:where(&)]:gap-10 [:where(&)]:overflow-hidden [:where(&)]:rounded-[6px] [:where(&)]:border [:where(&)]:border-solid [:where(&)]:border-line';
/** A segmented control in the inspector: a soft track; its buttons quiet, the chosen one raised. */
export const SEG_PANEL =
  'sc-seg [:where(&)]:inline-flex [:where(&)]:h-(--field-h) [:where(&)]:gap-2 [:where(&)]:overflow-hidden [:where(&)]:rounded-md [:where(&)]:border [:where(&)]:border-solid [:where(&)]:border-line [:where(&)]:bg-surface-2 [:where(&)]:p-1 [:where(&_button)]:rounded-sm [:where(&_button)]:px-(--sp-2) [:where(&_button)]:py-0 [:where(&_button)]:text-xs [:where(&_button)]:text-muted [:where(&_button)]:[background:none] [:where(&_button)]:[border:0] [:where(&)_button[aria-pressed=true]]:bg-surface [:where(&)_button[aria-pressed=true]]:text-fg [:where(&)_button[aria-pressed=true]]:[box-shadow:var(--shadow-1)]';
/** The colour fill's Solid / Gradient choice: the inspector's track without a border. */
export const SEG_FILL =
  'sc-seg inline-flex h-(--field-h) gap-2 overflow-hidden rounded-md [border-width:0] [border-style:none] border-line bg-surface-2 p-1';

/** The colour fill's settings: no frame, small muted text; its fields in the text colour, its buttons like the app's. */
export const FILL =
  'sc-fill m-0 grid gap-6 p-0 text-xs text-muted [border:0] [&_.sc-field]:text-fg [:where(&_button)]:inline-flex [:where(&_button)]:items-center [:where(&_button)]:justify-center [:where(&_button)]:gap-(--sp-1) [:where(&_button)]:h-(--field-h) [:where(&_button)]:px-(--sp-3) [:where(&_button)]:py-0 [:where(&_button)]:border [:where(&_button)]:border-solid [:where(&_button)]:border-line-strong [:where(&_button)]:rounded-md [:where(&_button)]:bg-surface [:where(&_button)]:text-fg [:where(&_button)]:text-sm [:where(&_button)]:leading-none [:where(&_button)]:no-underline [:where(&_button)]:cursor-pointer [:where(&_button)]:[transition:background_var(--t-fast),border-color_var(--t-fast)] [:where(&_button)]:[justify-self:start] [:where(&)_button:hover:not(:disabled)]:bg-surface-2';

/** A colour fill's swatch. */
export const SWATCH = 'sc-swatch h-48 rounded-md border border-solid border-line';

/** An "Upload…" label that looks like a button; in a card it is a column, as the card's labels are. */
export function upload(inCard = false): string {
  return `sc-upload ${inCard ? 'grid gap-4' : 'inline-flex gap-(--sp-1)'} h-(--field-h) cursor-pointer items-center justify-center rounded-md border border-solid border-line-strong bg-surface px-(--sp-3) py-0 text-sm leading-none text-fg no-underline [justify-self:start] [transition:background_var(--t-fast),border-color_var(--t-fast)] hover:bg-surface-2`;
}

/** A text link that is a button (Sign in / Set up, Use a colour instead): accent text, no frame. */
export const LINK = 'sc-link p-0 text-left text-accent [background:none] [border:0]';
/** The inspector's link: framed like its other buttons. */
export const LINK_PANEL =
  'sc-link inline-flex h-(--field-h) items-center rounded-md border border-solid border-line-strong bg-surface px-(--sp-3) py-0 text-left text-sm text-fg [justify-self:start]';

/** A picture in the inspector: 160 px, contained on a checkerboard. */
export const THUMB_PANEL = `sc-thumb h-160 w-full rounded-md border border-solid border-line object-contain ${CHECKER}`;
/** Its place when there is no picture yet. */
export const THUMB_PANEL_EMPTY = `sc-thumb sc-thumb--empty grid h-160 w-full place-items-center rounded-md border border-solid border-line object-contain text-[12px] text-muted ${CHECKER}`;
/** A picture on an input node: its own size, up to the card's width and 140 px. */
export const THUMB_NODE = `sc-thumb block h-auto max-h-140 w-auto max-w-full rounded-md border border-solid border-line object-contain ${CHECKER}`;
/** No picture yet on an input node: a short box; an editor's is a dashed drop target. */
export const THUMB_NODE_EMPTY = `sc-thumb sc-thumb--empty grid h-72 w-full place-items-center rounded-md border border-solid border-line object-contain px-(--sp-2) text-center text-[12px] text-muted ${CHECKER}`;
export const THUMB_NODE_UPLOAD = `sc-thumb sc-thumb--empty sc-thumb--upload grid h-72 w-full cursor-pointer place-items-center rounded-md border border-dashed border-muted object-contain px-(--sp-2) text-center text-[12px] text-muted ${CHECKER} hover:border-accent hover:text-accent`;

/** A drag grip at the start of a row (layers, Preset node sizes). */
export const GRIP = 'sc-port__grip inline-flex flex-none cursor-grab text-muted';

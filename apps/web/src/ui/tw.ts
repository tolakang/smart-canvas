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

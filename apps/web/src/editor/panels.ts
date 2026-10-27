/**
 * The editors' panels as Tailwind classes (P28 T7b): Layers (left), Design (right) with the text properties and a
 * Preview's override inspector, the Comments panel and the comments' pins (T7c). Every panel sits in the
 * editor (`.sc-fig`, editor/shell.ts), and the text properties and the inspector always sit in the Design panel, so
 * each class is what the old rules gave an element there.
 *
 * - Where one old rule set a shorthand and then a longhand (`border-bottom: …; border-bottom-color: …`), the shorthand
 *   is written with `[:where(&)]:` so the longhand wins, as it did.
 * - `.sc-field` (styles.css) still sizes the number inputs in the Design panel's grid; the old rules let it.
 * - The dropdown chevron (styles.css) outranks the fields' face, so only their background colour is set; focus
 *   clears it, as before.
 * - State rules keep the old selectors' weight: hover beats pressed (the lock), focus beats hover (number fields).
 */

/** The Layers panel: rows with a thumbnail, top = front. */
export const LAYERS = 'sc-layers w-240 flex-none overflow-auto [background:var(--surface)] [border-right:1px_solid_var(--fig-line)]';
/** "Layers top = front". */
export const LAYERS_TITLE = 'sc-layers__title flex items-baseline gap-6 px-16 pt-12 pb-8 text-[11px] font-[600] [border-bottom:0]';
/** A section's title in the Design panel (text properties, overrides). */
export const PANEL_TITLE = 'sc-layers__title flex items-baseline gap-6 px-16 pt-12 pb-4 text-[11px] font-[600] [border-bottom:0]';
export const LAYERS_LIST = 'sc-layers__list m-0 list-none p-0';

/** A layer row: selected, hidden on this Preview, not wired, or where a dragged row would drop. */
export function layerRowClass(o: { selected: boolean; hidden: boolean; unwired: boolean; drop: boolean }) {
  const state = o.selected
    ? ' sc-layer--selected [background:var(--fig-select)] [box-shadow:none]'
    : `${o.drop ? ' [box-shadow:inset_0_2px_0_var(--accent)]' : ''} hover:[background:var(--fig-hover)]`;
  return `sc-layer group/layer flex min-h-32 items-center gap-6 rounded-[10px] px-8 py-0 [border-bottom:0] [&[draggable=true]]:cursor-grab ${o.hidden ? ' sc-layer--hidden' : ''}${o.unwired ? ' sc-layer--unwired' : ''}${o.drop ? ' sc-layer--drop' : ''}${state}`;
}
/** The row's name and its kind; a hidden layer's name is struck through, an unwired one is faded. */
export const layerNameClass = (hidden: boolean, unwired: boolean) =>
  `sc-layer__name grid min-w-0 flex-1 p-2 text-left text-[11px] [background:none] [border:0] [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap ${unwired ? ' opacity-60' : ''}${hidden ? ' [&>span:first-child]:line-through [&>span:first-child]:opacity-50' : ''}`;
/** The row's buttons: shown on hover, on the selected row, or while one has focus. */
export const layerActionsClass = (selected: boolean) =>
  `sc-layer__actions flex gap-2 ${selected ? 'opacity-100' : 'opacity-0 group-hover/layer:opacity-100 focus-within:opacity-100'} [&_button]:size-22 [&_button]:rounded-[4px] [&_button]:p-0 [&_button]:text-[11px] [&_button]:text-muted [&_button]:[background:none] [&_button]:[border:1px_solid_transparent] [&_button:hover:not(:disabled)]:border-line [&_button:hover:not(:disabled)]:text-fg [&_button:disabled]:opacity-30`;
/** The layer's picture, fill or first letter, on a checkerboard. */
export const THUMB =
  'sc-layer-thumb inline-flex size-20 flex-none items-center justify-center overflow-hidden rounded-[2px] [border:1px_solid_var(--line)] [background:repeating-conic-gradient(var(--checker-a)_0%_25%,var(--checker-b)_0%_50%)_0_0_/_8px_8px] [&_img]:size-full [&_img]:object-contain';
/** "edited": the layer was moved by hand on this Preview. */
export const EDITED =
  'sc-edited ml-6 rounded-[4px] px-5 py-0 align-[1px] text-[10px] font-[600] text-accent [background:color-mix(in_srgb,var(--accent)_14%,transparent)]';

/** The Design panel (and the Comments panel in its place). */
const DESIGN_BOX = 'sc-design flex-none overflow-auto [background:var(--fig-panel)] [border-left:1px_solid_var(--fig-line)]';
export const DESIGN = `${DESIGN_BOX} w-248`;
export const COMMENTS = `${DESIGN_BOX} sc-comments flex w-300 flex-col`;
const SECTION_BOX =
  'sc-design__section gap-8 px-16 py-12 [:where(&)]:[border-bottom:1px_solid_var(--fig-line)] [border-bottom-color:color-mix(in_srgb,var(--line)_70%,transparent)]';
export const SECTION = `${SECTION_BOX} grid`;
/** Gestures on touch screens, keyboard shortcuts elsewhere. */
export const SECTION_TOUCH = `${SECTION_BOX} sc-design__touch sc-design__shortcuts--touch hidden pointer-coarse:grid`;
export const SECTION_KEYS = `${SECTION_BOX} sc-design__shortcuts grid pointer-coarse:hidden`;
export const TITLE = 'sc-design__title flex flex-wrap items-baseline gap-6 text-[12px] font-[600]';
/** The Comments panel's head: its title and the resolved toggle, apart. */
export const COMMENTS_HEAD = 'sc-design__title sc-comments__head flex flex-wrap items-center justify-between gap-6 text-[12px] font-[600]';
/** A folding section's title, with a chevron that turns when open. */
export const SUMMARY =
  "sc-design__title flex cursor-pointer [list-style:none] flex-wrap items-center justify-between gap-6 text-[12px] font-[600] [&::-webkit-details-marker]:hidden after:size-6 after:content-[''] after:[border-right:1.5px_solid_var(--muted)] after:[border-bottom:1.5px_solid_var(--muted)] after:[transform:rotate(45deg)] after:[transition:transform_var(--t-fast)] [details[open]>&]:after:[transform:rotate(225deg)]";
/** One gesture per line. */
export const GESTURES_LIST =
  'sc-gestures m-0 grid gap-2 [&>div]:grid [&>div]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] [&>div]:items-baseline [&>div]:gap-12 [&>div]:px-0 [&>div]:py-8 [&>div]:[border-top:1px_solid_color-mix(in_srgb,var(--line)_70%,transparent)] [&>div:first-child]:[border-top:0] [&_dt]:text-[12.5px] [&_dt]:font-[650] [&_dt]:text-fg [&_dd]:m-0 [&_dd]:text-[12.5px] [&_dd]:text-muted';
export const KEYS =
  'sc-design__keys m-0 grid gap-4 [&_div]:flex [&_div]:justify-between [&_div]:gap-8 [&_dt]:[color:var(--fig-fg)] [&_dd]:m-0 [&_dd]:text-right [&_dd]:[color:var(--fig-muted)]';
/** X, Y, W, H, rotation, skew and the lock. */
export const GRID = 'sc-design__grid grid grid-cols-[1fr_1fr] gap-8';
export const NUM =
  'sc-design__num flex h-28 items-center gap-0 rounded-[5px] pl-8 [color:var(--fig-muted)] [background:var(--fig-hover)] [border:1px_solid_transparent] [&:hover:not(:focus-within)]:[border-color:var(--fig-line)] focus-within:[border-color:var(--fig-blue)] focus-within:[background:var(--surface)] [&_input]:h-26 [&_input]:min-w-0 [&_input]:text-[11px] [&_input]:[color:var(--fig-fg)] [&_input]:[background:none] [&_input]:[border:0] [&_input]:[outline:none] [&_input]:[-moz-appearance:textfield] [&_input::-webkit-inner-spin-button]:hidden';
export const LOCK =
  'sc-design__lock inline-grid size-28 place-items-center rounded-[5px] [justify-self:start] [color:var(--fig-muted)] [background:none] [border:0] aria-pressed:[color:var(--fig-blue)] aria-pressed:[background:var(--fig-select)] [&:hover:not(:disabled)]:[color:var(--fig-fg)] [&:hover:not(:disabled)]:[background:var(--fig-hover)]';

/** The text properties: font, size, weight, colour, align, lines, language. */
export const PROPS = 'sc-props w-auto flex-none overflow-visible [background:var(--surface)] [border-left:0]';
export const PROPS_BODY =
  'sc-props__body m-0 grid gap-8 px-16 pt-8 pb-12 text-[11px] [border:0] [:where(&)_:is(select,input[type=number])]:[font:inherit] [:where(&)_:is(select,input[type=number])]:[border:1px_solid_var(--line)] [&_:is(select,input[type=number])]:h-28 [&_:is(select,input[type=number])]:w-full [&_:is(select,input[type=number])]:rounded-[5px] [&_:is(select,input[type=number])]:px-6 [&_:is(select,input[type=number])]:py-4 [&_:is(select,input[type=number])]:text-[11px] [&_:is(select,input[type=number])]:[border-color:transparent] [&_:is(select,input[type=number])]:[background-color:var(--fig-hover)] [&_:is(select,input[type=number]):focus]:[border-color:var(--fig-blue)] [&_:is(select,input[type=number]):focus]:[background:var(--surface)] [&_:is(select,input[type=number]):focus]:[outline:none] [&_input[type=color]]:h-28 [&_input[type=color]]:w-44 [&_input[type=color]]:rounded-[4px] [&_input[type=color]]:p-0 [&_input[type=color]]:[border:1px_solid_var(--line)]';
export const PROPS_ROW = 'sc-props__row grid grid-cols-[1fr_1fr] gap-10';
export const NOTE = 'sc-props__note m-0 text-[12px]';
/** The text itself, in the Layer Comp editor. */
export const TEXT = 'sc-text mt-0 w-full resize-y rounded-[6px] px-8 py-6 text-[14px] [:where(&)]:[font:inherit] [border:1px_solid_var(--line)]';
/** The text box in the board's inspector (its panel's field rules style the rest). */
export const BOARD_TEXT = 'sc-text mt-8 w-full resize-y px-8 py-6 [font:inherit] [border:1px_solid_var(--line)]';

/** A Preview's side of the Design panel: overrides, then the text properties. */
export const SIDE = 'sc-editor__side flex w-auto flex-none flex-col overflow-visible [background:var(--surface)] [border-left:0]';
/** The override inspector (T5.2): a Preview's hand edits per layer, with reset. */
export const INSPECTOR = 'sc-inspector px-0 pt-0 pb-8 [border-bottom:1px_solid_var(--fig-line)]';
export const INSPECTOR_NOTE = `${NOTE} px-12 py-4`;
export const INSPECTOR_TABLE =
  'sc-inspector__table mx-12 my-4 w-[calc(100%-24px)] border-collapse text-[12px] [&_:is(td,th)]:px-4 [&_:is(td,th)]:py-2 [&_:is(td,th)]:[border-bottom:1px_solid_var(--line)] [&_th]:text-left [&_th]:font-[600] [&_th]:text-muted';
export const INSPECTOR_ACTIONS = 'sc-inspector__actions px-12 py-4';

/** D63: a comment's pin on the canvas (numbered; the open one dark, a resolved one grey), or the new one's "+". */
const PIN =
  'sc-pin absolute z-5 inline-grid h-24 min-w-24 cursor-pointer place-items-center rounded-[12px_12px_12px_2px] mx-0 mt-[-24px] mb-0 px-6 py-0 [color:var(--on-accent)] [border:2px_solid_white] [font:600_11px/1_var(--font,inherit)] [box-shadow:var(--shadow-2)] pointer-coarse:h-32 pointer-coarse:min-w-32 pointer-coarse:mt-[-32px] pointer-coarse:rounded-[16px_16px_16px_3px]';
export const pinClass = (on: boolean, resolved: boolean) =>
  `${PIN} ${on ? 'sc-pin--on [outline:2px_solid_var(--accent)]' : ''} ${resolved ? 'sc-pin--resolved [background:var(--muted)]' : on ? '[background:var(--fg)]' : '[background:var(--accent)]'}`;
export const PIN_NEW = `${PIN} sc-pin--new pointer-events-none [background:var(--warn)]`;
/** The pin's number in front of its comment. */
export const PIN_INLINE =
  'sc-pin sc-pin--inline static z-5 inline-grid h-18 min-w-18 cursor-default place-items-center rounded-[12px_12px_12px_2px] m-0 px-6 py-0 text-[10px] [color:var(--on-accent)] [background:var(--accent)] [:where(&)]:[border:2px_solid_white] [border-width:0] [:where(&)]:[font:600_11px/1_var(--font,inherit)] [box-shadow:none]';

/** The Comments panel: "Show resolved", the hint, the threads, the box for a new comment. */
export const COMMENTS_TOGGLE = 'sc-comments__toggle inline-flex items-center gap-4 text-[11px] font-[400] text-muted';
export const COMMENTS_HINT = 'sc-comments__hint m-0 text-[11px] leading-[1.5]';
export const COMMENTS_LIST = 'sc-comments__list m-0 flex-1 overflow-auto p-0 [list-style:none]';
export const threadClass = (on: boolean, resolved: boolean) =>
  `sc-comments__thread grid gap-6 px-16 py-10 [border-bottom:1px_solid_var(--fig-line)] ${on ? 'sc-comments__thread--on [background:var(--accent-soft)]' : ''} ${resolved ? 'sc-comments__thread--resolved opacity-70' : ''}`;
export const REPLY = 'sc-comments__reply ml-14 pl-10 [border-left:2px_solid_var(--fig-line)]';
export const COMMENT = 'sc-comment grid gap-4 text-[12px]';
export const COMMENT_META = 'sc-comment__meta flex flex-wrap items-center gap-6';
/** The comment's text: a button that opens its pin, or plain text for a reply. */
const COMMENT_TEXT =
  'sc-comment__text m-0 p-0 text-left whitespace-pre-wrap [overflow-wrap:anywhere] [color:inherit] [font:inherit] [background:none] [border:0]';
export const COMMENT_TEXT_BUTTON = `${COMMENT_TEXT} cursor-pointer`;
export const COMMENT_TEXT_PLAIN = `${COMMENT_TEXT} cursor-auto`;
export const COMMENT_RESOLVED = 'sc-comment__resolved m-0 text-[11px]';
/** Small buttons: Resolve / Edit / Delete, Cancel / Post, Reply; taller on touch. */
const SMALL_BUTTONS =
  '[&_button]:min-h-24 [&_button]:cursor-pointer [&_button]:rounded-sm [&_button]:px-8 [&_button]:py-0 [&_button]:text-[11px] [&_button]:[color:inherit] [:where(&)_button]:[font:inherit] [&_button]:[background:var(--fig-panel)] [&_button]:[border:1px_solid_var(--fig-line)] pointer-coarse:[&_button]:min-h-40 pointer-coarse:[&_button]:px-12';
export const COMMENT_ACTIONS = `sc-comment__actions flex justify-end gap-6 ${SMALL_BUTTONS}`;
export const COMPOSE_ACTIONS = String.raw`sc-comments__compose-actions flex justify-end gap-6 ${SMALL_BUTTONS} [&_.sc-comments\_\_primary]:font-[600] [&_.sc-comments\_\_primary]:text-on-accent [&_.sc-comments\_\_primary]:border-accent [&_.sc-comments\_\_primary]:[background:var(--accent)] [&_.sc-comments\_\_primary:disabled]:cursor-default [&_.sc-comments\_\_primary:disabled]:opacity-50`;
export const REPLY_BUTTON =
  'sc-comments__reply-btn min-h-24 cursor-pointer rounded-sm px-8 py-0 text-[11px] [justify-self:start] [color:inherit] [:where(&)]:[font:inherit] [background:var(--fig-panel)] [border:1px_solid_var(--fig-line)] pointer-coarse:min-h-40 pointer-coarse:px-12';
export const COMPOSE =
  'sc-comments__compose grid gap-6 [&_textarea]:box-border [&_textarea]:min-h-48 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-sm [&_textarea]:px-8 [&_textarea]:py-6 [&_textarea]:text-[12px] [&_textarea]:[color:inherit] [:where(&)_textarea]:[font:inherit] [&_textarea]:[background:var(--surface)] [&_textarea]:[border:1px_solid_var(--fig-line)] [&_textarea:focus]:border-accent [&_textarea:focus]:[outline:none]';

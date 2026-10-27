/**
 * The editors' shell as Tailwind classes (P28 T7a): the full-screen editor, its glass bar (tools, title, zoom, Close),
 * the stage with the canvas and its overlays, the body that lays out the panels, and the phone's Layers | Design tabs.
 * The panels themselves (Layers, Design, inspector, comments) and the transform box (`tb-*`) are still CSS.
 *
 * - `.sc-fig` sets the editor's own variables; `--line`, `--muted` and `--input` follow them, as before.
 * - Every button in the bar shares one quiet face. It is written with `:where()`, so a button's own classes win over
 *   it, as they did over the old CSS. Hover and disabled keep the old selectors' weight: hover beats a pressed tool.
 * - `_` in a class is a space, so a selector naming `sc-editor__side` is written with `\_` (String.raw).
 */

/** The screen: fixed over the board, safe areas kept. */
const SCREEN =
  'sc-editor-screen fixed inset-0 z-50 box-border flex h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-0 pl-[env(safe-area-inset-left)]';
/** While fonts load. */
export const LOADING = `${SCREEN} sc-muted [background:var(--bg)]`;
/** The editor: its variables, compact 11 px type, the ambient backdrop. */
export const FIG = `${SCREEN} sc-fig font-sans text-[11px] [color:var(--fig-fg)] [background:var(--ambient)] [--fig-panel:var(--surface)] [--fig-line:var(--line)] [--fig-hover:var(--surface-2)] [--fig-select:var(--accent-soft)] [--fig-blue:var(--accent)] [--fig-canvas:var(--canvas)] [--fig-fg:var(--fg)] [--fig-muted:var(--muted)] [--line:var(--fig-line)] [--input:var(--fig-select)] [--muted:var(--fig-muted)] [--fig-bar:var(--glass)] [--fig-bar-hover:color-mix(in_srgb,var(--fg)_7%,transparent)] [--fig-bar-fg:var(--fg)] [--fig-bar-muted:var(--muted)] dark:[--fig-bar-hover:color-mix(in_srgb,var(--fg)_9%,transparent)]`;

/** The bar: one line that never wraps; the title takes what is left. Its buttons share one face. */
export const BAR =
  'sc-fig__bar flex h-52 flex-none items-center gap-12 overflow-hidden mx-12 mt-10 mb-0 px-8 py-0 rounded-[14px] text-[12px] whitespace-nowrap [color:var(--fig-bar-fg)] [background:var(--fig-bar)] [border:1px_solid_color-mix(in_srgb,var(--line)_80%,transparent)] [backdrop-filter:blur(16px)_saturate(1.4)] [box-shadow:var(--shadow-2)] max-md:mx-6 max-md:mt-6 max-md:gap-(--sp-1) [:where(&)>*]:flex-none ' +
  '[:where(&)_button]:h-34 [:where(&)_button]:rounded-[9px] [:where(&)_button]:px-10 [:where(&)_button]:py-0 [:where(&)_button]:text-[12px] [:where(&)_button]:font-[500] [:where(&)_button]:[color:var(--fig-bar-fg)] [:where(&)_button]:[background:none] [:where(&)_button]:[border:0] max-md:[:where(&)_button]:px-8 [:where(&)_button:hover:not(:disabled)]:[background:var(--fig-bar-hover)] [:where(&)_button:disabled]:text-faint';
/** Move, Hand and the other tools: square, the accent when on. */
export const TOOLS = 'sc-fig__tools inline-flex gap-2';
export const TOOL =
  'sc-fig__tool inline-grid w-36 place-items-center p-0! aria-pressed:text-on-accent aria-pressed:[background:var(--accent)] aria-pressed:[box-shadow:0_4px_10px_-4px_color-mix(in_srgb,var(--accent)_70%,transparent)]';
/** The Comment tool, with the open threads' count. */
export const COMMENT_TOOL = `${TOOL} sc-fig__tool--comment relative`;
export const COUNT =
  'sc-fig__count absolute -top-4 -right-4 h-14 min-w-14 rounded-[7px] bg-accent px-3 py-0 text-center text-[9px] leading-[14px] text-on-accent';
/** The name, its size and notes; only the name on a phone. */
export const TITLE =
  'sc-fig__title inline-flex min-w-0 flex-[1_1_auto] items-center gap-10 overflow-hidden text-[12px] [&_strong]:overflow-hidden [&_strong]:text-[13px] [&_strong]:font-[650] [&_strong]:text-ellipsis max-md:[&>:not(strong)]:hidden!';
export const SELECTION = 'sc-fig__muted sc-fig__selection max-w-[22ch] overflow-hidden text-ellipsis max-md:hidden!';
export const MUTED = 'sc-fig__muted';
export const ZOOM = 'sc-zoom ml-0 inline-flex items-center gap-2 [&_button]:min-w-28';
export const ZOOM_VALUE = 'sc-zoom__value min-w-48 text-center text-[11px] tabular-nums';
export const ZOOM_ACTUAL = 'sc-zoom__actual max-md:hidden!';
export const CLOSE = 'sc-fig__close [border:1px_solid_var(--line-strong)]! [background:var(--surface)]!';

/** The body: the panels around the stage; floating glass panels from 768 px, a bottom sheet on a phone. */
const BODY = String.raw`sc-editor__body flex min-h-0 flex-1 max-md:flex-col md:gap-12 md:px-12 md:pt-10 md:pb-12 md:max-2xl:[&>.sc-layers]:w-200 md:max-2xl:[&>.sc-design]:w-220 md:max-2xl:[&>.sc-editor\_\_side]:w-220 md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:[border:1px_solid_color-mix(in_srgb,var(--line)_80%,transparent)]! md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:rounded-[18px] md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:[background:var(--glass)] md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:[backdrop-filter:blur(16px)] md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:[box-shadow:var(--shadow-2)] 2xl:[&>.sc-layers]:w-270 2xl:[&>.sc-design]:w-280 2xl:[&>.sc-design.sc-comments]:w-320 max-md:[&>:is(.sc-editor\_\_canvas,.sc-editor\_\_stage)]:order-1 max-md:[&>.sc-sheet-tabs]:order-2 max-md:[&>:is(.sc-layers,.sc-design,.sc-editor\_\_side)]:order-3`;
/** On a phone, Design (Comments) and the Preview's side panel are the sheet under the tabs, whichever tab is on. */
const SHEET = String.raw`max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:w-auto max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:pb-[env(safe-area-inset-bottom)] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:[border-left:0] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:[border-top:1px_solid_var(--line)] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:[border-radius:var(--r-lg)_var(--r-lg)_0_0] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:[box-shadow:var(--shadow-2)] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:max-h-[calc(45dvh-52px)] max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:overflow-auto`;
/** The Layers tab: the Layers panel takes the sheet, with taller rows. */
const SHEET_LAYERS = String.raw`max-md:[&>.sc-layers]:block max-md:[&>.sc-layers]:w-auto max-md:[&>.sc-layers]:pb-[env(safe-area-inset-bottom)] max-md:[&>.sc-layers]:[border-top:1px_solid_var(--line)] max-md:[&>.sc-layers]:[border-right:0] max-md:[&>.sc-layers]:[border-bottom:0] max-md:[&>.sc-layers]:[border-left:0] max-md:[&>.sc-layers]:[border-radius:var(--r-lg)_var(--r-lg)_0_0] max-md:[&>.sc-layers]:[background:var(--surface)] max-md:[&>.sc-layers]:[box-shadow:var(--shadow-2)] max-md:[&>.sc-layers]:max-h-[calc(45dvh-52px)] max-md:[&>.sc-layers]:overflow-auto max-md:[&>.sc-layers_.sc-layer]:min-h-52 max-md:[&>:is(.sc-design,.sc-editor\_\_side)]:hidden`;
export const bodyClass = (sheet: 'layers' | 'design') =>
  `${BODY} sc-editor__body--sheet-${sheet} ${SHEET} ${sheet === 'layers' ? SHEET_LAYERS : 'max-md:[&>.sc-layers]:hidden'}`;

/** The stage: the grey canvas around the artwork; the editor's touch gestures are its own (D58). */
export const stageClass = (hand: boolean) =>
  `sc-editor__stage relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden [background:var(--fig-canvas,var(--canvas))] md:rounded-[18px] md:[background:color-mix(in_srgb,var(--canvas)_85%,transparent)] md:[border:1px_solid_color-mix(in_srgb,var(--line)_80%,transparent)] md:[box-shadow:inset_0_1px_3px_rgb(16_24_40/0.06)] ${hand ? 'sc-editor__stage--hand cursor-grab' : ''}`;
/** The artwork, on a checkerboard. */
export const CANVAS =
  'sc-editor__canvas absolute [background:repeating-conic-gradient(var(--checker-a)_0_25%,var(--checker-b)_0_50%)_0_0_/_16px_16px] [box-shadow:0_0_0_1px_rgb(16_24_40/0.06),0_12px_32px_-8px_rgb(16_24_40/0.28)]';
/** The layer under the pointer. */
export const HOVER = 'sc-editor__hover pointer-events-none absolute top-0 left-0 outline-offset-0 [outline:1.5px_solid_var(--fig-blue)]';
/** M1: the dragged layer's spot in the other layouts, with the layout's name. */
export const SPOT =
  'sc-editor__spot pointer-events-none absolute top-0 left-0 origin-center opacity-70 outline-offset-[-1px] [outline:1px_dashed_var(--fig-blue,var(--accent))]';
export const SPOT_NAME =
  'absolute top-2 left-2 rounded-[2px] px-3 py-0 [font:600_10px/1.2_system-ui,sans-serif] [color:var(--fig-blue,var(--accent))] [background:color-mix(in_srgb,var(--surface)_80%,transparent)]';
/** The selection: the transform box's target, or an outline when view only. */
export const TARGET = 'sc-editor__target absolute top-0 left-0 cursor-move touch-none';
/** "120 × 80" under the selection. */
export const SIZE =
  'sc-editor__size pointer-events-none absolute z-4 rounded-[2px] px-4 py-1 text-[10px] leading-[14px] whitespace-nowrap text-on-accent tabular-nums [background:var(--fig-blue)] [transform:translateX(-50%)]';
/** Reset rotation / skew, on a rotated or skewed layer. */
export const RESETS =
  'sc-editor__resets absolute z-6 flex gap-2 rounded-[6px] p-2 [background:var(--fig-panel)] [border:1px_solid_var(--fig-line)] [box-shadow:var(--shadow-1)]';
export const RESET =
  'grid size-24 cursor-pointer place-items-center rounded-[4px] p-0 [color:var(--fig-muted)] [background:none] [border:0] hover:[color:var(--fig-fg)] hover:[background:var(--fig-hover)] focus-visible:outline-offset-[-2px] focus-visible:[outline:2px_solid_var(--fig-blue)] pointer-coarse:size-36';
/** D63: where a comment's pin goes. */
export const POINT = 'sc-editor__point absolute inset-0 z-4 cursor-crosshair touch-none';
/** Hand tool / Space: the canvas pans. */
export const PAN = 'sc-editor__pan absolute inset-0 z-5 cursor-grab touch-none active:cursor-grabbing';

/** V3: Layers | Design tabs, on a phone only. */
export const TABS =
  'sc-sheet-tabs hidden max-md:mx-12 max-md:mt-0 max-md:mb-[-1px] max-md:flex max-md:gap-4 max-md:rounded-[14px_14px_0_0] max-md:p-4 max-md:[background:var(--glass)] max-md:[backdrop-filter:blur(16px)] max-md:[box-shadow:0_-6px_16px_-10px_rgb(16_24_40/0.25)]';
export const tabClass = (on: boolean) =>
  `max-md:min-h-44 max-md:flex-1 max-md:rounded-[10px] max-md:text-[14px] max-md:font-[650] max-md:[border:0] max-md:[-webkit-tap-highlight-color:transparent] ${on ? 'sc-sheet-tabs__on max-md:text-fg max-md:[background:var(--surface)] max-md:[box-shadow:var(--shadow-1)]' : 'max-md:text-muted max-md:[background:transparent]'}`;

/** A field group in the board's inspector editors (board/editors.tsx). */
export const FIELDS = 'sc-editor mt-0 grid gap-(--sp-2)';

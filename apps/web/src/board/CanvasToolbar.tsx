/**
 * Floating canvas toolbar (T13.5): Select (V) / Hand (H) tools, zoom out / level / in, fit (Shift+1), tidy board
 * (N4), grid snap and minimap toggles. Every button has a tooltip (name, what it does, shortcut): on hover after a
 * short delay, on keyboard focus, and on a long press on touch screens (where hover doesn't exist). A glass panel over the bottom of the canvas; lives inside <ReactFlow> for its viewport.
 * On tablets and phones (T13.6) it also opens the node library and the inspector; phones drop the zoom buttons
 * (pinch instead) and the minimap. On touch (D58) Select several stands in for Select / Hand.
 */
import { Panel, useReactFlow, useStoreApi, useViewport } from '@xyflow/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './LayerRow';

export type CanvasTool = 'select' | 'hand';

/** Fit leaves room for this toolbar at the bottom, so no node ends up under it. Fit all shows every panel, however small. */
export const FIT_ALL_OPTIONS = { maxZoom: 1, padding: { top: '24px', left: '24px', right: '24px', bottom: '96px' } } as const;
/**
 * D69 (UX B3, F4): Fit to screen stops at 40%, where a card's buttons and text stay readable; a larger board is then
 * centred and the rest is a pan away (or "Fit all"). Not on a phone: there 40% shows about one card, so Fit still
 * shows the whole board and a tap on a panel brings it close (Q8).
 */
export const FIT_MIN_ZOOM = 0.4;
export const fitOptions = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? FIT_ALL_OPTIONS : ({ ...FIT_ALL_OPTIONS, minZoom: FIT_MIN_ZOOM } as const);

/** What each button does, shown under its name in the tooltip. */
const TIPS: Record<string, string> = {
  'Add nodes': 'Add asset and Preset nodes',
  Add: 'Add an asset node or a Preset node of sizes',
  Inspector: 'Settings of the selected node',
  'Select (V)':
    'Click a panel to select it, drag to move it; Shift-click adds one; drag on empty canvas to select several. Arrows nudge, Esc clears, Ctrl/⌘ + A selects all',
  'Hand: drag to pan (H, or hold Space)': 'Drag anywhere to move the board; panels stay put. Hold Space to pan from any tool',
  'Select several': 'Tap panels to add or take them out; drag on empty canvas to draw a box around them. Done when finished',
  'Zoom out': 'Zoom out (Ctrl/⌘ + wheel, or pinch)',
  'Zoom in': 'Zoom in (Ctrl/⌘ + wheel, or pinch)',
  'Fit to screen (Shift+1)': 'Show the board, no smaller than 40% so it stays readable',
  'Fit all': 'Show every panel, however small',
  'Tidy board': 'Arrange all panels: asset nodes in a row, Main Comps under them, Preset nodes and their Previews below',
  'Tidy selection': 'Arrange the selected panels in an even grid',
  'Snap to grid': 'Panels snap to the 16 px grid when moved (hold Alt to place one freely)',
  Minimap: 'Show a small map of the whole board',
};
/** The tooltip's title: the button's name without the shortcut in brackets; the shortcut on its own. */
function tipParts(label: string): { name: string; key?: string } {
  if (label.startsWith('Hand')) return { name: 'Hand', key: 'H, or hold Space' };
  if (label === 'Tidy board' || label === 'Tidy selection') return { name: label, key: 'Shift+T' };
  const m = /^(.*?) \((.+)\)$/.exec(label);
  return m ? { name: m[1] as string, key: m[2] } : { name: label };
}
const HOVER_MS = 350;

/** The bar: a glass strip over the bottom of the canvas (above the home indicator on phones). */
const BAR =
  'sc-canvasbar flex items-center gap-2 rounded-[16px] border border-line bg-glass p-6 [backdrop-filter:blur(12px)] [box-shadow:var(--shadow-3)] max-md:mb-[calc(var(--sp-2)+env(safe-area-inset-bottom))]';
/** A tool: muted, darker on hover, tinted while on; a larger target on touch. */
const BUTTON =
  'sc-canvasbar__btn grid size-32 cursor-pointer place-items-center rounded-md bg-transparent text-muted [border:0] [transition:background_var(--t-fast),color_var(--t-fast)] [&:hover:not([aria-pressed=true])]:bg-surface-2 [&:hover:not([aria-pressed=true])]:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1 pointer-coarse:min-h-44 pointer-coarse:min-w-44';
const SEP = 'sc-canvasbar__sep mx-(--sp-1) h-20 w-1 bg-line';
const ZOOM = 'sc-canvasbar__zoom min-w-44 text-center text-sm [font-variant-numeric:tabular-nums] text-fg';
/**
 * A button's tooltip, above it (the bar sits at the bottom): it fades and rises in, and never takes the pointer. The
 * first and last ones line up with the bar's ends so they stay on screen (its first and last spans are always buttons;
 * `_` in a class means a space, so the selector can't name `sc-canvasbar__item`).
 */
const TIP =
  'sc-tip pointer-events-none absolute bottom-[calc(100%+10px)] left-[50%] z-20 flex w-max max-w-[min(240px,70vw)] flex-col gap-2 rounded-md bg-fg px-8 py-6 text-left text-sm leading-[1.35] text-surface [box-shadow:var(--shadow-2)] [.sc-canvasbar>span:first-of-type_&]:left-0 [.sc-canvasbar>span:last-of-type_&]:right-0 [.sc-canvasbar>span:last-of-type_&]:left-auto motion-reduce:[transition:none] motion-reduce:[transform:translate(-50%,0)]';
const TIP_HIDDEN =
  'invisible opacity-0 [transform:translate(-50%,4px)] [transition:opacity_var(--t-fast),transform_var(--t-fast),visibility_0s_linear_var(--t-fast)] [.sc-canvasbar>span:first-of-type_&]:[transform:translate(0,4px)] [.sc-canvasbar>span:last-of-type_&]:[transform:translate(0,4px)]';
const TIP_SHOWN =
  'sc-tip--show visible opacity-100 [transform:translate(-50%,0)] [transition:opacity_var(--t-fast),transform_var(--t-fast)] [.sc-canvasbar>span:first-of-type_&]:[transform:translate(0,0)] [.sc-canvasbar>span:last-of-type_&]:[transform:translate(0,0)]';
const LONG_PRESS_MS = 450;

/** A toolbar button with its tooltip. A long press on touch shows the tooltip and doesn't press the button. */
function ToolButton(props: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  const [tip, setTip] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const id = `tip-${props.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const clear = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => clear, []);
  const { name, key } = tipParts(props.label);
  return (
    <span className="sc-canvasbar__item relative inline-flex">
      <button
        type="button"
        className={BUTTON}
        aria-label={props.label}
        aria-describedby={id}
        aria-pressed={props.pressed}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          clear();
          timer.current = window.setTimeout(() => setTip(true), HOVER_MS);
        }}
        onPointerLeave={() => {
          clear();
          setTip(false);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return setTip(false);
          longPressed.current = false;
          clear();
          timer.current = window.setTimeout(() => {
            longPressed.current = true;
            setTip(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return;
          clear();
          if (longPressed.current) window.setTimeout(() => setTip(false), 1200);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setTip(true)}
        onBlur={() => setTip(false)}
        onKeyDown={(e) => e.key === 'Escape' && setTip(false)}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          setTip(false);
          props.onClick();
        }}
      >
        {props.children}
      </button>
      <span id={id} role="tooltip" className={`${TIP} ${tip ? TIP_SHOWN : TIP_HIDDEN}`}>
        <span className="sc-tip__name flex items-center gap-6 font-[600]">
          {name}
          {key && <kbd className="sc-tip__key rounded-[4px] bg-[color-mix(in_srgb,var(--surface)_22%,transparent)] px-4 py-0 [font-family:inherit] [font-style:inherit] [line-height:inherit] text-[11px] font-[500]">{key}</kbd>}
        </span>
        {TIPS[props.label] && <span className="sc-tip__text opacity-[0.82]">{TIPS[props.label]}</span>}
      </span>
    </span>
  );
}

export function CanvasToolbar(props: {
  tool: CanvasTool;
  onTool: (t: CanvasTool) => void;
  grid: boolean;
  onGrid: (on: boolean) => void;
  minimap: boolean;
  onMinimap: (on: boolean) => void;
  /** Tablet / phone: which floating panel is open, and how to switch. */
  panels?: { open: 'library' | 'inspector' | null; onOpen: (p: 'library' | 'inspector' | null) => void; library: boolean };
  compact?: boolean;
  /** The minimap button (desktop only, where the minimap shows). */
  minimapToggle?: boolean;
  /** N4: lays the board out again (absent when read-only). */
  onTidy?: () => void;
  /** Two or more panels selected: Tidy arranges just those (D57). */
  tidySelection?: boolean;
  /**
   * D58, touch: the Select several toggle stands in for Select / Hand (one finger already moves the board and a tap
   * selects).
   */
  several?: { on: boolean; onToggle: () => void };
  /** D70 (UX B7, phone): Add sits first in this bar, where a thumb reaches it, instead of inside the ⋯ menu. */
  onAdd?: () => void;
}) {
  const { panels, compact } = props;
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const btn = (label: string, pressed: boolean | undefined, onClick: () => void, child: ReactNode) => (
    <ToolButton label={label} pressed={pressed} onClick={onClick}>
      {child}
    </ToolButton>
  );
  return (
    <Panel position="bottom-center" className={BAR} aria-label="Canvas tools" role="toolbar">
      {props.onAdd && btn('Add', undefined, props.onAdd, <Icon name="plus" />)}
      {props.onAdd && <span className={SEP} aria-hidden="true" />}
      {panels?.library && btn('Add nodes', panels.open === 'library', () => panels.onOpen(panels.open === 'library' ? null : 'library'), <Icon name="plus" />)}
      {panels && btn('Inspector', panels.open === 'inspector', () => panels.onOpen(panels.open === 'inspector' ? null : 'inspector'), <Icon name="panel" />)}
      {panels && <span className={SEP} aria-hidden="true" />}
      {props.several ? (
        btn('Select several', props.several.on, props.several.onToggle, <Icon name="marquee" />)
      ) : (
        <>
          {btn('Select (V)', props.tool === 'select', () => props.onTool('select'), <Icon name="cursor" />)}
          {btn('Hand: drag to pan (H, or hold Space)', props.tool === 'hand', () => props.onTool('hand'), <Icon name="hand" />)}
        </>
      )}
      <span className={SEP} aria-hidden="true" />
      {!compact && btn('Zoom out', undefined, () => void zoomOut({ duration: 150 }), <Icon name="minus" />)}
      <span className={ZOOM} aria-label="Board zoom">
        {Math.round(zoom * 100)}%
      </span>
      {!compact && btn('Zoom in', undefined, () => void zoomIn({ duration: 150 }), <Icon name="plus" />)}
      {btn('Fit to screen (Shift+1)', undefined, () => void fitView({ ...fitOptions(), duration: 200 }), <Icon name="fit" />)}
      {!compact && btn('Fit all', undefined, () => void fitView({ ...FIT_ALL_OPTIONS, duration: 200 }), <Icon name="fitAll" />)}
      {props.onTidy && btn(props.tidySelection ? 'Tidy selection' : 'Tidy board', undefined, props.onTidy, <Icon name="arrange" />)}
      <span className={SEP} aria-hidden="true" />
      {btn('Snap to grid', props.grid, () => props.onGrid(!props.grid), <Icon name="grid" />)}
      {!compact && (
        <>
          {props.minimapToggle !== false && btn('Minimap', props.minimap, () => props.onMinimap(!props.minimap), <Icon name="map" />)}
        </>
      )}
    </Panel>
  );
}

/**
 * D58, touch: while Select several is on, React Flow behaves as if Shift were held — a tap adds or takes out a
 * panel, a box adds to the selection. Lives inside <ReactFlow> for its store.
 */
export function MultiSelect({ on }: { on: boolean }) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ multiSelectionActive: on });
    return () => store.setState({ multiSelectionActive: false });
  }, [store, on]);
  return null;
}

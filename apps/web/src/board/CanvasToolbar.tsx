/**
 * Floating canvas toolbar (T13.5): Select (V) / Hand (H) tools, zoom out / level / in, fit (Shift+1), tidy board
 * (N4), grid snap and minimap toggles. Every button has a tooltip (name, what it does, shortcut): on hover after a
 * short delay, on keyboard focus, and on a long press on touch screens (where hover doesn't exist). A glass panel over the bottom of the canvas; lives inside <ReactFlow> for its viewport.
 * On tablets and phones (T13.6) it also opens the node library and the inspector; phones drop the zoom buttons
 * (pinch instead), grid and minimap.
 */
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './LayerRow';

export type CanvasTool = 'select' | 'hand';

/** Fit leaves room for this toolbar at the bottom, so no node ends up under it. */
export const FIT_OPTIONS = { maxZoom: 1, padding: { top: '24px', left: '24px', right: '24px', bottom: '96px' } } as const;

/** What each button does, shown under its name in the tooltip. */
const TIPS: Record<string, string> = {
  'Add nodes': 'Add asset and Preset nodes',
  Inspector: 'Settings of the selected node',
  'Select (V)': 'Click a panel to select it, drag it to move it; drag on empty canvas to select several',
  'Hand: drag to pan (H, or hold Space)': 'Drag anywhere to move the board; panels stay put',
  'Zoom out': 'Zoom out (Ctrl/⌘ + wheel, or pinch)',
  'Zoom in': 'Zoom in (Ctrl/⌘ + wheel, or pinch)',
  'Fit to screen (Shift+1)': 'Show every panel',
  'Tidy board': 'Arrange all panels: asset nodes in a row, the Layer Comp under them, Preset nodes and their Previews below',
  'Snap to grid': 'Panels snap to a 16 px grid when moved',
  Minimap: 'Show a small map of the whole board',
};
/** The tooltip's title: the button's name without the shortcut in brackets; the shortcut on its own. */
function tipParts(label: string): { name: string; key?: string } {
  if (label.startsWith('Hand')) return { name: 'Hand', key: 'H, or hold Space' };
  const m = /^(.*?) \((.+)\)$/.exec(label);
  return m ? { name: m[1] as string, key: m[2] } : { name: label };
}
const HOVER_MS = 350;
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
    <span className="sc-canvasbar__item">
      <button
        type="button"
        className="sc-canvasbar__btn"
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
      <span id={id} role="tooltip" className={`sc-tip${tip ? ' sc-tip--show' : ''}`}>
        <span className="sc-tip__name">
          {name}
          {key && <kbd className="sc-tip__key">{key}</kbd>}
        </span>
        {TIPS[props.label] && <span className="sc-tip__text">{TIPS[props.label]}</span>}
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
    <Panel position="bottom-center" className="sc-canvasbar" aria-label="Canvas tools" role="toolbar">
      {panels?.library && btn('Add nodes', panels.open === 'library', () => panels.onOpen(panels.open === 'library' ? null : 'library'), <Icon name="plus" />)}
      {panels && btn('Inspector', panels.open === 'inspector', () => panels.onOpen(panels.open === 'inspector' ? null : 'inspector'), <Icon name="panel" />)}
      {panels && <span className="sc-canvasbar__sep" aria-hidden="true" />}
      {btn('Select (V)', props.tool === 'select', () => props.onTool('select'), <Icon name="cursor" />)}
      {btn('Hand: drag to pan (H, or hold Space)', props.tool === 'hand', () => props.onTool('hand'), <Icon name="hand" />)}
      <span className="sc-canvasbar__sep" aria-hidden="true" />
      {!compact && btn('Zoom out', undefined, () => void zoomOut({ duration: 150 }), <Icon name="minus" />)}
      <span className="sc-canvasbar__zoom" aria-label="Board zoom">
        {Math.round(zoom * 100)}%
      </span>
      {!compact && btn('Zoom in', undefined, () => void zoomIn({ duration: 150 }), <Icon name="plus" />)}
      {btn('Fit to screen (Shift+1)', undefined, () => void fitView({ ...FIT_OPTIONS, duration: 200 }), <Icon name="fit" />)}
      {props.onTidy && btn('Tidy board', undefined, props.onTidy, <Icon name="arrange" />)}
      {!compact && (
        <>
          <span className="sc-canvasbar__sep" aria-hidden="true" />
          {btn('Snap to grid', props.grid, () => props.onGrid(!props.grid), <Icon name="grid" />)}
          {props.minimapToggle !== false && btn('Minimap', props.minimap, () => props.onMinimap(!props.minimap), <Icon name="map" />)}
        </>
      )}
    </Panel>
  );
}

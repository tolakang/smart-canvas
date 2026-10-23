/**
 * Floating canvas toolbar (T13.5): Select (V) / Hand (H) tools, zoom out / level / in, fit (Shift+1), tidy board
 * (N4), grid snap and minimap toggles. A glass panel over the bottom of the canvas; lives inside <ReactFlow> for its viewport.
 * On tablets and phones (T13.6) it also opens the node library and the inspector; phones drop the zoom buttons
 * (pinch instead), grid and minimap.
 */
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import type { ReactNode } from 'react';
import { Icon } from './LayerRow';

export type CanvasTool = 'select' | 'hand';

/** Fit leaves room for this toolbar at the bottom, so no node ends up under it. */
export const FIT_OPTIONS = { maxZoom: 1, padding: { top: '24px', left: '24px', right: '24px', bottom: '96px' } } as const;

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
    <button type="button" className="sc-canvasbar__btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {child}
    </button>
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
      {props.onTidy && btn('Tidy board', undefined, props.onTidy, <Icon name="tidy" />)}
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

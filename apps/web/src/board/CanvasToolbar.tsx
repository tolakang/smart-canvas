/**
 * Floating canvas toolbar (T13.5): Select (V) / Hand (H) tools, zoom out / level / in, fit (Shift+1), grid snap
 * and minimap toggles. A glass panel over the bottom of the canvas; lives inside <ReactFlow> for its viewport.
 */
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import type { ReactNode } from 'react';
import { Icon } from './LayerRow';

export type CanvasTool = 'select' | 'hand';

export function CanvasToolbar(props: {
  tool: CanvasTool;
  onTool: (t: CanvasTool) => void;
  grid: boolean;
  onGrid: (on: boolean) => void;
  minimap: boolean;
  onMinimap: (on: boolean) => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const btn = (label: string, pressed: boolean | undefined, onClick: () => void, child: ReactNode) => (
    <button type="button" className="sc-canvasbar__btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {child}
    </button>
  );
  return (
    <Panel position="bottom-center" className="sc-canvasbar" aria-label="Canvas tools" role="toolbar">
      {btn('Select (V)', props.tool === 'select', () => props.onTool('select'), <Icon name="cursor" />)}
      {btn('Hand: drag to pan (H, or hold Space)', props.tool === 'hand', () => props.onTool('hand'), <Icon name="hand" />)}
      <span className="sc-canvasbar__sep" aria-hidden="true" />
      {btn('Zoom out', undefined, () => void zoomOut({ duration: 150 }), <Icon name="minus" />)}
      <span className="sc-canvasbar__zoom" aria-label="Board zoom">
        {Math.round(zoom * 100)}%
      </span>
      {btn('Zoom in', undefined, () => void zoomIn({ duration: 150 }), <Icon name="plus" />)}
      {btn('Fit to screen (Shift+1)', undefined, () => void fitView({ duration: 200, maxZoom: 1 }), <Icon name="fit" />)}
      <span className="sc-canvasbar__sep" aria-hidden="true" />
      {btn('Snap to grid', props.grid, () => props.onGrid(!props.grid), <Icon name="grid" />)}
      {btn('Minimap', props.minimap, () => props.onMinimap(!props.minimap), <Icon name="map" />)}
    </Panel>
  );
}

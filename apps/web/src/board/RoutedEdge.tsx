/**
 * A wire with reroute points (T13.8). Without points it is React Flow's usual curve; with points it curves
 * through each of them. Points can be dragged (one undo step when let go) and double-clicked away; a
 * double-click on the wire adds one (Board). Every wire has a small ✂ badge at its middle (PDF page 3), larger
 * while the wire is selected — the way to take a wire off on a touch screen (no Delete key; its ends are small to grab). Removing it goes
 * through the board's edge deletion, like Delete (an output's wire freezes it).
 */
import { setEdgePoints } from '@smart-canvas/core';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { useState, type PointerEvent } from 'react';
import { useBoard } from './context';
import { routePath } from './wires';

type XY = { x: number; y: number };
export type RoutedEdgeData = { points?: XY[] };
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, selected, interactionWidth } = props;
  const { readOnly, run } = useBoard();
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  /** While a point is dragged: the points shown (committed on release). */
  const [drag, setDrag] = useState<{ index: number; points: XY[] } | null>(null);
  const points = drag?.points ?? data?.points ?? [];
  const [bezier, midX, midY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const path = points.length ? routePath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, points) : bezier;
  // Where the Disconnect button sits: the curve's middle, or the middle reroute point.
  const mid = points.length ? (points[Math.floor((points.length - 1) / 2)] as XY) : { x: midX, y: midY };

  const down = (index: number) => (e: PointerEvent<SVGCircleElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, points: [...points] });
  };
  const move = (e: PointerEvent<SVGCircleElement>) => {
    if (!drag) return;
    const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDrag({ ...drag, points: drag.points.map((p, i) => (i === drag.index ? at : p)) });
  };
  const up = () => {
    if (!drag) return;
    const next = drag.points;
    setDrag(null);
    run((d) => setEdgePoints(d, id, next));
  };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      {!readOnly && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`sc-wire-cut${selected ? '' : ' sc-wire-cut--idle'} nodrag nopan`}
            // Just above the wire, never on it: a double-click there (adding a reroute point) must not hit it.
            style={{ transform: `translate(-50%, calc(-100% - ${selected ? 12 : 6}px)) translate(${mid.x}px, ${mid.y}px)` }}
            aria-label={selected ? 'Disconnect wire' : 'Cut wire'}
            data-edge={id}
            title="Cut this wire (or select it and press Delete)"
            onClick={(e) => {
              e.stopPropagation();
              void deleteElements({ edges: [{ id }] });
            }}
          >
            ✂
          </button>
        </EdgeLabelRenderer>
      )}
      {!readOnly &&
        points.map((p, i) => (
          <circle
            key={i}
            className="sc-reroute nodrag nopan"
            cx={p.x}
            cy={p.y}
            r={5}
            aria-label={`Reroute point ${i + 1}`}
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={up}
            onDoubleClick={(e) => {
              e.stopPropagation();
              run((d) => setEdgePoints(d, id, points.filter((_, j) => j !== i)));
            }}
          />
        ))}
    </>
  );
}

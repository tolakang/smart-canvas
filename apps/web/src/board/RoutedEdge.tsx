/**
 * A wire with reroute points (T13.8). Without points it is React Flow's usual curve; with points it curves
 * through each of them. Points can be dragged (one undo step when let go) and double-clicked away; a
 * double-click on the wire adds one (Board).
 */
import { setEdgePoints } from '@smart-canvas/core';
import { BaseEdge, getBezierPath, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { useState, type PointerEvent } from 'react';
import { useBoard } from './context';
import { routePath } from './wires';

type XY = { x: number; y: number };
export type RoutedEdgeData = { points?: XY[] };
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data } = props;
  const { readOnly, run } = useBoard();
  const { screenToFlowPosition } = useReactFlow();
  /** While a point is dragged: the points shown (committed on release). */
  const [drag, setDrag] = useState<{ index: number; points: XY[] } | null>(null);
  const points = drag?.points ?? data?.points ?? [];
  const path = points.length ? routePath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, points) : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0];

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
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
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

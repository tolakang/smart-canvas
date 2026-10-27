/**
 * A wire with reroute points (T13.8). Without points it is React Flow's usual curve; with points it curves
 * through each of them. Points can be dragged (one undo step when let go) and double-clicked away; a
 * double-click on the wire adds one (Board). V1 (2026-10-25, owner: keep the board clean): the scissor badge (PDF page 3; the owner's
 * icon) shows only while the pointer is on the wire or the wire is selected — a tap selects it on a touch screen (no Delete key; its
 * ends are small to grab). Removing it goes through the board's edge deletion, like Delete (an output's wire freezes it).
 */
import { setEdgePoints } from '@smart-canvas/core';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useBoard } from './context';
import { routePath } from './wires';

type XY = { x: number; y: number };
/** `noCut` (D51): no ✂ badge on hover for this wire (it still shows the Disconnect button when selected). */
export type RoutedEdgeData = { points?: XY[]; noCut?: boolean };
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

/** The ✂ badge on a wire: a larger one with a shadow on a selected wire (Disconnect), a smaller one on hover (Cut). */
const CUT =
  'sc-wire-cut absolute top-0 left-0 z-10 grid cursor-pointer place-items-center rounded-[22%] bg-transparent p-0 [border:0] [pointer-events:all] [transition:transform_var(--t-fast),opacity_var(--t-fast)] hover:[transform:scale(1.12)] focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-2';
const CUT_SELECTED = 'size-28 [box-shadow:var(--shadow-2)] pointer-coarse:size-40';
const CUT_HOVER = 'sc-wire-cut--hover size-24 [box-shadow:var(--shadow-1)] pointer-coarse:size-36';

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, selected, interactionWidth } = props;
  const { readOnly, run } = useBoard();
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  /** While a point is dragged: the points shown (committed on release). */
  const [drag, setDrag] = useState<{ index: number; points: XY[] } | null>(null);
  /** The pointer is on the wire or its badge (leaving waits a moment, so the badge can be reached). */
  const [hover, setHover] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (leave.current) clearTimeout(leave.current);
    setHover(true);
  };
  const exit = () => {
    if (leave.current) clearTimeout(leave.current);
    leave.current = setTimeout(() => setHover(false), 250);
  };
  useEffect(() => () => void (leave.current && clearTimeout(leave.current)), []);
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
      <g onPointerEnter={(e) => e.pointerType === 'mouse' && enter()} onPointerLeave={exit}>
        <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      </g>
      {!readOnly && (selected || (hover && !data?.noCut)) && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`${CUT} ${selected ? CUT_SELECTED : CUT_HOVER} nodrag nopan`}
            onPointerEnter={enter}
            onPointerLeave={exit}
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
            <ScissorIcon />
          </button>
        </EdgeLabelRenderer>
      )}
      {!readOnly &&
        points.map((p, i) => (
          <circle
            key={i}
            className="sc-reroute nodrag nopan cursor-move fill-surface stroke-accent stroke-2 [pointer-events:all] hover:fill-accent-soft"
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

/** The owner's scissor badge (2026-10-23): white scissors on a dark rounded square. */
function ScissorIcon() {
  return (
    <svg className="sc-wire-cut__icon block size-full" viewBox="0 0 480 480" aria-hidden="true">
      <path d="M400,480L80,480C36,480 0,444 0,400L0,80C0,36 36,0 80,0L400,0C444,0 480,36 480,80L480,400C480,444 444,480 400,480Z" fill="#101111" />
      <path
        fill="#fff"
        d="M332.3,334.5C339.3,338.8 345.6,345 350.3,352.8C363.7,374.9 360.2,401.7 342.4,412.6C324.6,423.4 299.2,414.3 285.7,392.2C274.5,373.9 275.1,352.2 285.9,339.2L286.2,338.9C288.4,336.4 290.8,334.2 293.7,332.5C296.6,330.8 299.6,329.5 302.8,328.8C302.9,328.8 303.1,328.7 303.2,328.7C305.5,328.2 308,327.9 310.4,327.9C317.7,327.9 325.3,330.2 332.3,334.5ZM332.5,396.2C343.2,389.6 345.5,373.8 337.6,360.8C329.7,347.8 314.5,342.6 303.8,349.1C293,355.6 290.8,371.5 298.7,384.5C306.6,397.5 321.8,402.7 332.5,396.2ZM185.9,332.3C203.6,343.2 207,370 193.4,392.1C186.7,403 177,411 166.1,414.7C155.5,418.3 145.1,417.4 136.6,412.2C128.1,407 122.6,398 121.1,386.9C119.5,375.5 122.3,363.2 129,352.4C138.7,336.7 154.4,327.6 169,327.6C171.6,327.6 174.2,327.9 176.7,328.5C179.9,329.3 183,330.5 185.9,332.3ZM180.6,384.1C188.6,371.2 186.4,355.3 175.7,348.6C165,342 149.8,347.2 141.8,360.2C133.8,373.2 136,389.1 146.7,395.7C157.4,402.3 172.6,397.1 180.6,384.1ZM288.6,324.2C286.7,325.3 285,326.6 283.3,328L254.4,280.5C253,278.2 250,277.5 247.7,278.9C239.3,284 228.2,281.3 223.1,272.9L217.5,263.8C217.4,263.7 217.3,263.5 217.2,263.3L127.4,115.9C116.6,98.201 121,75.3 136.9,62.8L235.7,225L235.9,225.3L262.3,268.7L262.5,269L294.4,321.3C292.4,322.1 290.5,323.1 288.6,324.2ZM238.1,271.3C243.4,271.3 247.7,267 247.7,261.701C247.7,256.4 243.4,252.1 238.1,252.1C232.8,252.1 228.5,256.4 228.5,261.701C228.5,267 232.8,271.3 238.1,271.3ZM353.2,116.4L266.6,257L245.7,222.7L343.9,63.3C359.8,75.9 364.1,98.701 353.2,116.4ZM214.8,278.1C216.7,281.2 219.2,283.9 222,286L196.3,327.9C194.6,326.5 192.9,325.2 191,324C189.1,322.8 187.2,321.8 185.2,321L213.2,275.5L214.8,278.1Z"
      />
    </svg>
  );
}

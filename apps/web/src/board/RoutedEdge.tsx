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
import { NO_DRAG } from './pinch';
import { routePath } from './wires';

type XY = { x: number; y: number };
/** `noCut` (D51): no ✂ badge on hover for this wire (it still shows the Disconnect button when selected). */
export type RoutedEdgeData = { points?: XY[]; noCut?: boolean };
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

/**
 * The ✂ badge on a wire (owner, 2026-11-03: "the wire should be stay the middle of icon but behind icon"): a round
 * dark badge centred on the wire, which runs behind it; a ring in the canvas colour sets it off the line. Larger with
 * a shadow on a selected wire (Disconnect), smaller on hover (Cut). The scale on hover is on the icon, so the badge's
 * centre stays on the wire.
 */
const CUT =
  'sc-wire-cut absolute top-0 left-0 z-10 grid cursor-pointer place-items-center rounded-full bg-fg p-0 text-bg [border:0] [pointer-events:all] [transition:opacity_var(--t-fast)] [&:hover_.sc-wire-cut__icon]:[transform:scale(1.12)] focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-2';
const CUT_SELECTED = 'size-28 [box-shadow:0_0_0_2px_var(--surface),var(--shadow-2)] pointer-coarse:size-40';
const CUT_HOVER = 'sc-wire-cut--hover size-24 [box-shadow:0_0_0_2px_var(--surface),var(--shadow-1)] pointer-coarse:size-36';
/** A click waits this long for a second one: a double-click on the badge adds a reroute point, as on the wire. */
const DOUBLE_MS = 220;

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
  // Where the badge sits: the curve's middle; on a rerouted wire, between its middle point and the next one (the
  // target after the last), so it never covers a point you drag.
  const k = Math.floor((points.length - 1) / 2);
  const a = points[k];
  const b = points[k + 1] ?? { x: targetX, y: targetY };
  const mid = a ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: midX, y: midY };
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (clickTimer.current && clearTimeout(clickTimer.current)), []);

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
            className={`${CUT} ${selected ? CUT_SELECTED : CUT_HOVER} ${NO_DRAG}`}
            onPointerEnter={enter}
            onPointerLeave={exit}
            // Centred on the wire, which runs behind it.
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
            aria-label={selected ? 'Disconnect wire' : 'Cut wire'}
            data-edge={id}
            title="Cut this wire (or select it and press Delete)"
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail > 1) return;
              if (clickTimer.current) clearTimeout(clickTimer.current);
              clickTimer.current = setTimeout(() => void deleteElements({ edges: [{ id }] }), e.detail === 0 ? 0 : DOUBLE_MS);
            }}
            // The badge sits on the wire: a double-click there adds a reroute point, as a double-click on the wire does.
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (clickTimer.current) clearTimeout(clickTimer.current);
              run((d) => setEdgePoints(d, id, a ? [...points.slice(0, k + 1), mid, ...points.slice(k + 1)] : [mid]));
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
            className={`sc-reroute ${NO_DRAG} cursor-move fill-surface stroke-accent stroke-2 [pointer-events:all] hover:fill-accent-soft`}
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

/** The ✂ glyph (owner, 2026-11-03: "Improve the scissors icon"): two blades crossing above two round handles, in the badge's text colour. */
function ScissorIcon() {
  return (
    <svg className="sc-wire-cut__icon block size-[62%] [transition:transform_var(--t-fast)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="17" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M9.1 14.9 18.5 3.5M14.9 14.9 5.5 3.5" />
    </svg>
  );
}

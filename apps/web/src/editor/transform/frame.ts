/**
 * Frames ↔ the transform box (pure). A Frame is the model's box: top-left + size in design px, turned by
 * `rotation` and leaned by `shear` about its centre. The box's state is the same thing as a centre, a base size
 * and scale factors, so a frame is `w = width·scaleX`, `h = height·scaleY` around the same centre.
 */
import type { Frame } from '@smart-canvas/core';
import { corners, derive, docFromState, pushOp, type TransformDoc, type TransformState, type Vec } from './math';

export function stateOfFrame(f: Frame): TransformState {
  return { x: f.x + f.w / 2, y: f.y + f.h / 2, width: f.w, height: f.h, scaleX: 1, scaleY: 1, rotation: f.rotation ?? 0, shear: f.shear ?? 0 };
}

/** Frames never mirror (the box runs with `flip: false`), so the scales are positive. */
export function frameOfState(s: TransformState): Frame {
  const w = s.width * Math.abs(s.scaleX);
  const h = s.height * Math.abs(s.scaleY);
  const rotation = ((s.rotation % 360) + 360) % 360;
  return { x: s.x - w / 2, y: s.y - h / 2, w, h, ...(Math.abs(s.shear) > 1e-9 ? { shear: s.shear } : {}), ...(rotation > 1e-9 && rotation < 360 - 1e-9 ? { rotation } : {}) };
}

const angleDiff = (a = 0, b = 0) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** Same box within `tol` design px / degrees (stored frames are rounded). */
export function sameShape(a: Frame, b: Frame, tol = 0.01): boolean {
  return Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol && angleDiff(a.rotation, b.rotation) <= tol && angleDiff(a.shear, b.shear) <= tol;
}
export const sameFrame = (a: Frame, b: Frame, tol = 0.01) => sameShape(a, b, tol) && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

/**
 * Keep a layer's history in step with its stored frame. The frame is the truth (typed values, arrow nudges,
 * undo, another person's edit): when it still matches the history, keep the history; when only the position
 * changed, record it as a move (resets keep working); otherwise start a new history from the frame.
 */
export function syncDoc(doc: TransformDoc | undefined, frame: Frame): TransformDoc {
  if (doc) {
    const now = frameOfState(derive(doc));
    if (sameFrame(now, frame)) return doc;
    if (sameShape(now, frame)) return pushOp(doc, { type: 'move', dx: frame.x - now.x, dy: frame.y - now.y });
  }
  return docFromState(stateOfFrame(frame));
}

/** The four corners of a frame as drawn (design px). */
export const frameCorners = (f: Frame): Vec[] => corners(stateOfFrame(f));

export interface SnapTargets {
  x: number[];
  y: number[];
}

/**
 * Snap a moved box: its left / centre / right (top / middle / bottom) of the drawn shape's bounds to the
 * nearest target within `tol`, per axis. Returns the correction and the lines it snapped to.
 */
export function snapMove(moved: TransformState, targets: SnapTargets, tol: number): { dx: number; dy: number; x: number[]; y: number[] } | null {
  const pts = corners(moved);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const best = (edges: number[], lines: number[]) => {
    let hit: { d: number; line: number } | null = null;
    for (const e of edges)
      for (const line of lines) {
        const d = line - e;
        if (Math.abs(d) <= tol && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, line };
      }
    return hit;
  };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const hx = best([minX, (minX + maxX) / 2, maxX], targets.x);
  const hy = best([minY, (minY + maxY) / 2, maxY], targets.y);
  if (!hx && !hy) return null;
  return { dx: hx?.d ?? 0, dy: hy?.d ?? 0, x: hx ? [hx.line] : [], y: hy ? [hy.line] : [] };
}

/** Snap lines from the canvas (edges, centre) and the other layers' drawn bounds (edges, centre). */
export function snapTargets(canvas: { width: number; height: number }, others: readonly Frame[]): SnapTargets {
  const x = [0, canvas.width / 2, canvas.width];
  const y = [0, canvas.height / 2, canvas.height];
  for (const f of others) {
    const pts = frameCorners(f);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    x.push(x0, (x0 + x1) / 2, x1);
    y.push(y0, (y0 + y1) / 2, y1);
  }
  return { x, y };
}

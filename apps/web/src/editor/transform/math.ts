/**
 * The editor's transform box (replaces react-moveable, see DECISIONS D36): pure math, no DOM.
 *
 * Transform math — pure functions, no DOM. State → CSS matrix, handle geometry, and "pointer moved to P" →
 * new state for each kind of drag.
 *
 * Model (Affinity Designer's)
 * ---------------------------
 * The element keeps its own (untransformed) size `width × height`; its centre sits at (x, y) in stage px.
 * About that centre it is transformed by the 2×2 linear map
 *
 *     M = R(rotation) · H(shear) · S(scaleX, scaleY)          H(φ) = [1 tan φ; 0 1]
 *
 * i.e. CSS `rotate(r) skewX(φ) scale(sx, sy)`. Like Affinity's Transform panel (R and S fields) there is ONE
 * shear angle: any parallelogram is exactly one (rotation, shear, scaleX, scaleY), so the state never has two
 * numbers fighting over the same shape. `rotation` is the direction of the top edge; `shear` tilts the
 * left/right edges away from perpendicular.
 *
 * Skewing works on the shape, not on the numbers: dragging an edge handle along its edge shears the box
 * along that edge, with the opposite edge fixed (or the centre, with Alt):
 *   - top/bottom edge sideways → the top/bottom edges slide, left/right edges lean (shear changes);
 *   - left/right edge up/down  → the left/right edges slide, top/bottom edges lean — which, in this model,
 *     is a change of rotation + shear + width together (Affinity: "vertical skew = shear minus rotation").
 * The new matrix is then decomposed back into the four numbers (`decompose`, a QR split).
 *
 * Coordinates used by the drags
 * - stage: CSS px of the stage element (what pointer events are converted to).
 * - local: the element's own px about its centre (before M). Edges are x = ±w/2, y = ±h/2.
 * - "box" space: stage − centre with R and H undone (not S). There the element is an axis-aligned box of
 *   half-size (sx·w/2, sy·h/2), so scaling is a 1-D problem per axis.
 */

import { MAX_SHEAR_DEG, type TransformHistory, type TransformOp as StoredTransformOp, type TransformOrigin } from '@smart-canvas/core';

/** Centre of the element, stage px. `width × height` is the untransformed size; negative scale = flipped. */
export type TransformState = TransformOrigin;

export type Vec = { x: number; y: number };
/** Column-major 2×2: [a c; b d], as in CSS matrix(a, b, c, d, e, f). Columns: local x axis (a, b), local y axis (c, d). */
export type Mat2 = { a: number; b: number; c: number; d: number };

/** Handles: n/s/e/w are the edge midpoints, ne/nw/se/sw the corners, plus rotate and the body (move). */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'body';
export type ScaleHandle = Exclude<HandleId, 'rotate' | 'body'>;
export type EdgeHandle = 'n' | 'e' | 's' | 'w';

/** Unit position of each scale handle: u along x, v along y, in −1…1 (centre = 0). */
export const HANDLE_UV: Record<ScaleHandle, Vec> = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 }, e: { x: 1, y: 0 },
  se: { x: 1, y: 1 }, s: { x: 0, y: 1 }, sw: { x: -1, y: 1 }, w: { x: -1, y: 0 },
};
export const SCALE_HANDLES = Object.keys(HANDLE_UV) as ScaleHandle[];
export const isCorner = (h: HandleId): h is 'nw' | 'ne' | 'se' | 'sw' => h.length === 2 && h !== 'rotate';
export const isEdge = (h: HandleId): h is EdgeHandle => h.length === 1;

export const MIN_SCALE = 0.02;
/** The box never gets flatter than this (the model's limit): edges stay at least 90° − MAX_SHEAR_DEG apart. */
export { MAX_SHEAR_DEG };

export const IDENTITY: Omit<TransformState, 'x' | 'y' | 'width' | 'height'> = { scaleX: 1, scaleY: 1, rotation: 0, shear: 0 };

const RAD = Math.PI / 180;
export const toRad = (deg: number) => deg * RAD;
export const toDeg = (rad: number) => rad / RAD;

// ---------------------------------------------------------------- small linear algebra

export const sub = (p: Vec, q: Vec): Vec => ({ x: p.x - q.x, y: p.y - q.y });
export const add = (p: Vec, q: Vec): Vec => ({ x: p.x + q.x, y: p.y + q.y });
export const scaleVec = (p: Vec, k: number): Vec => ({ x: p.x * k, y: p.y * k });
export const dot = (p: Vec, q: Vec) => p.x * q.x + p.y * q.y;
export const cross = (p: Vec, q: Vec) => p.x * q.y - p.y * q.x;
export const len = (p: Vec) => Math.hypot(p.x, p.y);
export const norm = (p: Vec): Vec => {
  const l = len(p);
  return l === 0 ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
};
export const mul = (m: Mat2, n: Mat2): Mat2 => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
});
export const apply = (m: Mat2, p: Vec): Vec => ({ x: m.a * p.x + m.c * p.y, y: m.b * p.x + m.d * p.y });
export const det = (m: Mat2) => m.a * m.d - m.b * m.c;
export const invert = (m: Mat2): Mat2 => {
  const k = 1 / det(m);
  return { a: m.d * k, b: -m.b * k, c: -m.c * k, d: m.a * k };
};
const colX = (m: Mat2): Vec => ({ x: m.a, y: m.b });
const colY = (m: Mat2): Vec => ({ x: m.c, y: m.d });

export const rotationMat = (deg: number): Mat2 => {
  const r = toRad(deg);
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r) };
};
/** CSS skewX(φ) = [1 tan φ; 0 1]. */
export const shearMat = (deg: number): Mat2 => ({ a: 1, b: 0, c: Math.tan(toRad(deg)), d: 1 });
export const scaleMat = (sx: number, sy: number): Mat2 => ({ a: sx, b: 0, c: 0, d: sy });

/** M = R · H · S. */
export const linear = (s: TransformState): Mat2 => mul(rotationMat(s.rotation), mul(shearMat(s.shear), scaleMat(s.scaleX, s.scaleY)));
/** R · H: maps "box" space to (stage − centre). */
const rotShear = (s: TransformState): Mat2 => mul(rotationMat(s.rotation), shearMat(s.shear));

const wrapDeg = (deg: number) => {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

/**
 * Split a linear map back into rotation, shear and scale (M = R · H · S). The local x column gives the
 * rotation and scaleX; what's left of the y column gives the shear and scaleY.
 * `like` keeps a flip where it was: a box flipped horizontally stays scaleX < 0 instead of turning into
 * "rotated 180° and flipped vertically", which is the same matrix.
 */
export function decompose(m: Mat2, like: Pick<TransformState, 'scaleX'>): Pick<TransformState, 'rotation' | 'shear' | 'scaleX' | 'scaleY'> {
  const ax = colX(m);
  const signX = like.scaleX < 0 ? -1 : 1;
  const scaleX = signX * len(ax);
  const rotation = toDeg(Math.atan2(signX * ax.y, signX * ax.x));
  const y = apply(rotationMat(-rotation), colY(m)); // = (tan φ · sy, sy)
  const scaleY = y.y;
  const shear = toDeg(Math.atan(y.x / scaleY));
  return { rotation: wrapDeg(rotation), shear, scaleX, scaleY };
}

/** Rebuild a state from a matrix, keeping centre and size. */
const withMatrix = (s: TransformState, m: Mat2): TransformState => ({ ...s, ...decompose(m, s) });

// ---------------------------------------------------------------- state → CSS / geometry

const n6 = (v: number) => (Math.abs(v) < 1e-10 ? 0 : +v.toFixed(6));

/**
 * The element's CSS. Lay the element out at left/top 0 of the stage with `transform-origin: 0 0`; the
 * translation part then moves its centre to (x, y) after the linear part has been applied about the centre:
 *   stage = C + M · (local − size/2)   ⇒   e,f = C − M · (w/2, h/2)
 */
export function toCssMatrix(s: TransformState): string {
  const m = linear(s);
  const t = sub({ x: s.x, y: s.y }, apply(m, { x: s.width / 2, y: s.height / 2 }));
  return `matrix(${n6(m.a)}, ${n6(m.b)}, ${n6(m.c)}, ${n6(m.d)}, ${n6(t.x)}, ${n6(t.y)})`;
}

/** The same transform as readable functions, for `transform-origin: 50% 50%` and left/top = centre − size/2. */
export function toCssFunctions(s: TransformState): string {
  return `rotate(${n6(s.rotation)}deg) skewX(${n6(s.shear)}deg) scale(${n6(s.scaleX)}, ${n6(s.scaleY)})`;
}

/** Stage position of a local point given in unit coords (u, v ∈ −1…1). */
export function pointAt(s: TransformState, uv: Vec): Vec {
  return add({ x: s.x, y: s.y }, apply(linear(s), { x: (uv.x * s.width) / 2, y: (uv.y * s.height) / 2 }));
}

/** Corners in drawing order (nw, ne, se, sw) — a parallelogram once sheared. */
export const corners = (s: TransformState): Vec[] => (['nw', 'ne', 'se', 'sw'] as const).map((h) => pointAt(s, HANDLE_UV[h]));

/**
 * Outward normal (unit, stage space) of a handle: for an edge handle it is perpendicular to that edge,
 * pointing away from the centre; for a corner, the direction from the centre to the corner.
 * Also the edge tangent for edge handles (unit vector along the edge).
 */
export function handleFrame(s: TransformState, h: ScaleHandle): { normal: Vec; tangent: Vec } {
  const uv = HANDLE_UV[h];
  const m = linear(s);
  const out = sub(pointAt(s, uv), { x: s.x, y: s.y });
  if (!isEdge(h)) return { normal: norm(out), tangent: norm({ x: -out.y, y: out.x }) };
  // The edge runs along the other local axis: e/w edges along local y, n/s edges along local x.
  const tangent = norm(uv.x !== 0 ? colY(m) : colX(m));
  let normal = { x: -tangent.y, y: tangent.x };
  if (dot(normal, out) < 0) normal = scaleVec(normal, -1);
  return { normal, tangent };
}

/** Where the rotate handle floats: `gap` px beyond the n edge, along that edge's outward normal. */
export function rotateHandlePos(s: TransformState, gap: number): Vec {
  return add(pointAt(s, HANDLE_UV.n), scaleVec(handleFrame(s, 'n').normal, gap));
}

/** The angle between the box's edges, as a lean from 90° (0 = rectangle). */
export function edgeLean(m: Mat2): number {
  const x = colX(m);
  const y = colY(m);
  return Math.abs(90 - toDeg(Math.acos(Math.max(-1, Math.min(1, dot(x, y) / (len(x) * len(y)))))));
}

// ---------------------------------------------------------------- drags (start state + pointer → state)

/** Never 0; with `flip` false, never negative either (a frame has no mirror: that's the Flip process). */
const clampScale = (v: number, flip = true) => (!flip ? Math.max(v, MIN_SCALE) : Math.abs(v) < MIN_SCALE ? (v < 0 ? -MIN_SCALE : MIN_SCALE) : v);
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

export type Pivot = 'opposite' | 'center';

export interface ScaleOptions {
  /** 'opposite' keeps the opposite handle fixed (Affinity default); 'center' scales about the centre (Alt). */
  pivot: Pivot;
  /** Corners keep the aspect ratio unless this is true (Shift). Edge handles always stretch one axis. */
  free: boolean;
  /** Dragging past the opposite edge mirrors the element (default); false stops at a minimum size. */
  flip?: boolean;
}

/**
 * Scale / stretch from handle `h`. `start` is the state when the drag began, `p0` the pointer then, `p` now.
 * Works in box space, where the handle sits at e = (u·sx·w/2, v·sy·h/2) and the pivot at a (0 or −e).
 * Scaling keeps rotation and shear: the edges keep their directions and only get longer or shorter.
 */
export function dragScale(start: TransformState, h: ScaleHandle, p0: Vec, p: Vec, o: ScaleOptions): TransformState {
  const uv = HANDLE_UV[h];
  const toBox = invert(rotShear(start));
  const c0 = { x: start.x, y: start.y };
  const e: Vec = { x: (uv.x * start.scaleX * start.width) / 2, y: (uv.y * start.scaleY * start.height) / 2 };
  // Keep the grab offset: the handle follows the pointer by the distance moved, not by where it was grabbed.
  const q = add(e, apply(toBox, sub(p, p0)));
  const a = o.pivot === 'center' ? { x: 0, y: 0 } : scaleVec(e, -1);
  const ea = sub(e, a);

  let t: Vec; // the handle's new position in box space
  if (isCorner(h) && !o.free) {
    // Proportional: project the pointer onto the pivot→handle line.
    const k = dot(sub(q, a), ea) / dot(ea, ea);
    t = add(a, scaleVec(ea, k));
  } else {
    // Edge handles move along their own axis only; free corners on both.
    t = { x: uv.x !== 0 ? q.x : e.x, y: uv.y !== 0 ? q.y : e.y };
  }
  const scaleX = uv.x !== 0 ? clampScale(finite((start.scaleX * (t.x - a.x)) / ea.x, start.scaleX), o.flip) : start.scaleX;
  const scaleY = uv.y !== 0 ? clampScale(finite((start.scaleY * (t.y - a.y)) / ea.y, start.scaleY), o.flip) : start.scaleY;
  // Recompute the handle from the clamped scales, then the centre between pivot and handle.
  const tc: Vec = { x: a.x + (ea.x * scaleX) / start.scaleX, y: a.y + (ea.y * scaleY) / start.scaleY };
  const centreBox = o.pivot === 'center' ? { x: 0, y: 0 } : scaleVec(add(a, tc), 0.5);
  const c = add(c0, apply(rotShear(start), centreBox));
  return { ...start, x: c.x, y: c.y, scaleX, scaleY };
}

// ---------------------------------------------------------------- operations (what a drag did)

/**
 * Every drag is recorded as one operation, independent of the state it was made on:
 * - scale: multiply scaleX / scaleY by kx / ky, keeping the element point `pivot` (unit coords) in place;
 * - shear: shear the element along its left/right ('lr') or top/bottom ('tb') edges by k (tan of the lean),
 *   keeping the line through `pivot` in place;
 * - rotate: turn by `deg` about the element's centre;
 * - move: translate.
 * The state is the original placement with the operations replayed in order (`derive`). A reset removes a
 * handle's operations and replays the rest, so the element ends up exactly where it would be had those drags
 * never happened, whatever was done before or after them.
 */
/** Same shape as the saved history (D41), so the editor and the project share one type. */
export type TransformOp = StoredTransformOp;
/** What to store (and undo/redo): the untransformed placement plus the operations. */
export type TransformDoc = TransformHistory;

/** Move `next` so the element point `pivotUV` (unit coords) is where it was in `prev`. */
export function keepPoint(prev: TransformState, next: TransformState, pivotUV: Vec): TransformState {
  const shift = sub(pointAt(prev, pivotUV), pointAt(next, pivotUV));
  return { ...next, x: next.x + shift.x, y: next.y + shift.y };
}

const shearLocal = (axis: 'lr' | 'tb', k: number): Mat2 => (axis === 'lr' ? { a: 1, b: k, c: 0, d: 1 } : { a: 1, b: 0, c: k, d: 1 });

/** Apply one operation to a state. Scale and shear act in the element's own frame (M · op), like the drags. */
export function applyOp(s: TransformState, op: TransformOp): TransformState {
  switch (op.type) {
    case 'scale':
      return keepPoint(s, { ...s, scaleX: clampScale(s.scaleX * op.kx), scaleY: clampScale(s.scaleY * op.ky) }, op.pivot);
    case 'shear':
      return keepPoint(s, withMatrix(s, mul(linear(s), shearLocal(op.axis, op.k))), op.pivot);
    case 'rotate':
      return { ...s, rotation: wrapDeg(s.rotation + op.deg) };
    case 'move':
      return { ...s, x: s.x + op.dx, y: s.y + op.dy };
  }
}

export const derive = (doc: TransformDoc): TransformState => doc.ops.reduce(applyOp, doc.origin);

/** A doc for a state with no history (loaded from elsewhere): shear, then scale, then rotate, about the centre. */
export function docFromState(s: TransformState): TransformDoc {
  const c = { x: 0, y: 0 };
  const ops: TransformOp[] = [];
  if (s.shear !== 0) ops.push({ type: 'shear', axis: 'tb', k: Math.tan(toRad(s.shear)), pivot: c });
  if (s.scaleX !== 1 || s.scaleY !== 1) ops.push({ type: 'scale', kx: s.scaleX, ky: s.scaleY, pivot: c });
  if (s.rotation !== 0) ops.push({ type: 'rotate', deg: s.rotation });
  return { origin: { ...s, ...IDENTITY }, ops };
}

const samePivot = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
const isIdentityOp = (op: TransformOp) =>
  (op.type === 'scale' && op.kx === 1 && op.ky === 1) || (op.type === 'shear' && op.k === 0) || (op.type === 'rotate' && op.deg === 0) || (op.type === 'move' && op.dx === 0 && op.dy === 0);

/**
 * Append an operation, merging it into the previous one when they compose exactly (same kind and pivot:
 * scale factors multiply, shears and angles add, moves add) so the list stays short.
 */
export function pushOp(doc: TransformDoc, op: TransformOp): TransformDoc {
  if (isIdentityOp(op)) return doc;
  const ops = doc.ops.slice();
  const last = ops[ops.length - 1];
  let merged: TransformOp | null = null;
  if (last?.type === 'scale' && op.type === 'scale' && samePivot(last.pivot, op.pivot)) merged = { ...last, kx: last.kx * op.kx, ky: last.ky * op.ky };
  if (last?.type === 'shear' && op.type === 'shear' && last.axis === op.axis && samePivot(last.pivot, op.pivot)) merged = { ...last, k: last.k + op.k };
  if (last?.type === 'rotate' && op.type === 'rotate') merged = { type: 'rotate', deg: last.deg + op.deg };
  if (last?.type === 'move' && op.type === 'move') merged = { type: 'move', dx: last.dx + op.dx, dy: last.dy + op.dy };
  if (merged) {
    ops.pop();
    if (!isIdentityOp(merged)) ops.push(merged);
  } else ops.push(op);
  return { ...doc, ops };
}

// ---------------------------------------------------------------- drags → operations

/** The point a drag of `h` keeps fixed, in unit coords: the opposite handle, or the centre (Alt, rotate, body). */
export function pivotOf(h: HandleId, pivot: Pivot = 'opposite'): Vec {
  if (h === 'rotate' || h === 'body' || pivot === 'center') return { x: 0, y: 0 };
  const uv = HANDLE_UV[h];
  return { x: -uv.x || 0, y: -uv.y || 0 };
}

export function scaleOp(start: TransformState, h: ScaleHandle, p0: Vec, p: Vec, o: ScaleOptions): TransformOp {
  const next = dragScale(start, h, p0, p, o);
  return { type: 'scale', kx: next.scaleX / start.scaleX, ky: next.scaleY / start.scaleY, pivot: pivotOf(h, o.pivot) };
}

/**
 * Skew (shear) from an edge handle, the way Affinity does it: the dragged edge slides along itself by the
 * pointer's movement along that edge; the opposite edge stays put (or, with pivot 'center', slides the
 * other way); the two edges in between lean. Movement across the edge is ignored.
 *
 * In local coords, for the e/w edges (x = ±w/2) that is the shear  y' = y + k·(x − ax)  with ax the fixed
 * edge (−u·w/2) or 0. The handle's edge moves by k·(u·w/2 − ax) = δ, so k = δ / (u·w/2 − ax). n/s likewise
 * with x and y swapped.
 */
export function skewOp(start: TransformState, h: EdgeHandle, p0: Vec, p: Vec, pivot: Pivot = 'opposite'): TransformOp {
  const uv = HANDLE_UV[h];
  const local = apply(invert(linear(start)), sub(p, p0)); // the pointer's movement in the element's own px
  const axis = uv.x !== 0 ? 'lr' : 'tb'; // lr: the e/w edges, which run along local y
  const half = axis === 'lr' ? (uv.x * start.width) / 2 : (uv.y * start.height) / 2; // the handle's edge
  const fixed = pivot === 'center' ? 0 : -half; // the edge that stays put
  const pivotUV = pivotOf(h, pivot);
  const op = (k: number): TransformOp => ({ type: 'shear', axis, k, pivot: pivotUV });
  let k = finite((axis === 'lr' ? local.y : local.x) / (half - fixed), 0);
  // Never flatten the box: if this k leans the edges too far, back off to the largest k that doesn't.
  const tooFar = (kk: number) => edgeLean(linear(applyOp(start, op(kk)))) > MAX_SHEAR_DEG;
  if (tooFar(k)) {
    let lo = 0;
    let hi = k;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (tooFar(mid)) hi = mid;
      else lo = mid;
    }
    k = lo;
  }
  return op(k);
}

export const dragSkew = (start: TransformState, h: EdgeHandle, p0: Vec, p: Vec, pivot: Pivot = 'opposite') => applyOp(start, skewOp(start, h, p0, p, pivot));

/** Rotate about the centre by the angle the pointer swept around it. `snap` (deg) rounds the resulting angle. */
export function rotateOp(start: TransformState, p0: Vec, p: Vec, snap = 0): TransformOp {
  const c = { x: start.x, y: start.y };
  const swept = toDeg(Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(p0.y - c.y, p0.x - c.x));
  let target = start.rotation + swept;
  if (snap > 0) target = Math.round(target / snap) * snap;
  return { type: 'rotate', deg: wrapDeg(target - start.rotation) };
}

export const dragRotate = (start: TransformState, p0: Vec, p: Vec, snap = 0) => applyOp(start, rotateOp(start, p0, p, snap));

export const moveOp = (p0: Vec, p: Vec): TransformOp => ({ type: 'move', dx: p.x - p0.x, dy: p.y - p0.y });
export const dragMove = (start: TransformState, p0: Vec, p: Vec) => applyOp(start, moveOp(p0, p));

// ---------------------------------------------------------------- which way is the pointer going?

export type EdgeIntent = 'stretch' | 'skew';

/**
 * Edge handle rule (touch, and the mouse by default — Affinity's side handles do both): compare the drag
 * with the handle's outward normal (stretch) and with its edge (skew). Returns null until the pointer has
 * moved `threshold` px, so the first few noisy pixels don't decide; the caller locks the answer for the rest
 * of the gesture.
 */
export function classifyEdgeDrag(s: TransformState, h: EdgeHandle, delta: Vec, threshold = 8): EdgeIntent | null {
  if (len(delta) < threshold) return null;
  const { normal, tangent } = handleFrame(s, h);
  return Math.abs(dot(delta, normal)) >= Math.abs(dot(delta, tangent)) ? 'stretch' : 'skew';
}

// ---------------------------------------------------------------- resets

/**
 * What a double-click / double-tap on each handle removes from the history. Each handle undoes what dragging
 * it (or its kind) does, and nothing else:
 * - rotate: every rotation;
 * - a corner: every scale (corners and edge stretches);
 * - left/right edge: the horizontal part of every scale, and every shear along the left/right edges;
 * - top/bottom edge: the vertical part of every scale, and every shear along the top/bottom edges;
 * - the element: everything but moves.
 * Change this function to change the behaviour; nothing else needs to know.
 */
export function removeForHandle(op: TransformOp, h: HandleId): TransformOp | null {
  if (h === 'body') return op.type === 'move' ? op : null;
  if (h === 'rotate') return op.type === 'rotate' ? null : op;
  if (isCorner(h)) return op.type === 'scale' ? null : op;
  const lr = h === 'e' || h === 'w';
  if (op.type === 'shear') return op.axis === (lr ? 'lr' : 'tb') ? null : op;
  if (op.type === 'scale') return lr ? { ...op, kx: 1 } : { ...op, ky: 1 };
  return op;
}

/**
 * A picture has its own shape (`aspect` = width / height). The history replays drags onto `origin`, the box
 * the editor started from — which is itself stretched when the picture was stretched before the editor
 * opened. A reset of a stretch or scale handle then also takes that old stretch out of the origin, on the
 * handle's axis: left/right edge → the width from the height, top/bottom edge → the height from the width, a
 * corner → both, keeping the area. The centre stays, and the drags of this session replay on top as before.
 */
export function restoreAspect(doc: TransformDoc, h: HandleId, aspect: number | undefined): TransformDoc {
  if (!aspect || !(aspect > 0) || h === 'rotate' || h === 'body') return doc;
  const { width: w, height: hh } = doc.origin;
  if (Math.abs(w / hh - aspect) <= 1e-9 * aspect) return doc;
  let width = w;
  let height = hh;
  if (h === 'e' || h === 'w') width = hh * aspect;
  else if (h === 'n' || h === 's') height = w / aspect;
  else {
    width = Math.sqrt(w * hh * aspect);
    height = width / aspect;
  }
  return { ...doc, origin: { ...doc.origin, width, height } };
}

export function resetForHandle(doc: TransformDoc, h: HandleId): TransformDoc {
  const ops = doc.ops.map((op) => removeForHandle(op, h)).filter((op): op is TransformOp => op !== null && !isIdentityOp(op));
  return { ...doc, ops };
}

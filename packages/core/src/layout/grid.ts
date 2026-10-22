/**
 * Layout v3 (D38): the stretched grid. The master canvas is a grid that stretches to the output's trim, so
 * every layer keeps its place on it:
 * - each axis has a pin — the layer's start edge, centre or end edge, by where its centre sits on the master
 *   (first third, middle third, last third) — and the pin lands on the same grid coordinate in the output;
 * - size: a layer that fills the master on both axes (touches all four edges, e.g. a background picture) covers
 *   the output, scaled proportionally; one that spans the master edge to edge on one axis only (a floor strip, a
 *   band) stretches with the grid — `sx` across, `sy` down — so it still spans edge to edge (owner, 2026-10-22);
 *   any other layer keeps its proportions and scales with the grid by `g = √(sx·sy)`, so it keeps the share of
 *   the canvas it has on the master (its stretched grid box's area), but never past the output's edges.
 */
import type { Frame } from '../model';
import type { RuleContext } from './context';

export type Pin = 'start' | 'centre' | 'end';

/** A layer "fills" an axis when it reaches within 0.5% of both master edges (or past them). */
export const FILL_TOLERANCE = 0.005;

/** Pin of a span `[lo, lo + size]` on a master axis of length `M`. */
export function pinOf(lo: number, size: number, M: number): Pin {
  const c = (lo + size / 2) / M;
  return c < 1 / 3 ? 'start' : c > 2 / 3 ? 'end' : 'centre';
}

export function fillsAxis(lo: number, size: number, M: number): boolean {
  return lo <= FILL_TOLERANCE * M && lo + size >= (1 - FILL_TOLERANCE) * M;
}

const PIN_AT: Record<Pin, number> = { start: 0, centre: 0.5, end: 1 };

/** The pin on an axis: filled axes pin the centre. */
const pinAt = (lo: number, size: number, M: number): number => PIN_AT[fillsAxis(lo, size, M) ? 'centre' : pinOf(lo, size, M)];

/**
 * Largest scale that keeps a span inside `[0, T]` once hung from its pin, or ∞ when the span isn't inside the
 * master on that axis (a decoration hanging off an edge may keep hanging off).
 */
function roomOn(lo: number, size: number, M: number, T: number): number {
  if (size <= 0 || lo < 0 || lo + size > M) return Infinity;
  const p = pinAt(lo, size, M);
  const X = ((lo + p * size) / M) * T;
  const room = p === 0 ? T - X : p === 1 ? X : 2 * Math.min(X, T - X);
  return room / size;
}

/**
 * The layer's proportional scale (its text size scale too): the filled axis' ratio (the larger when it fills
 * both; a layer filling one axis is stretched by `gridFrame`, this is its text scale); else the grid scale `√(sx·sy)`,
 * capped so a layer inside the master stays inside the output. Never below `k` (at `k` it always fits).
 */
export function gridScale(F: Frame, ctx: RuleContext): number {
  const { trim } = ctx.metrics;
  const sx = trim.w / ctx.master.w;
  const sy = trim.h / ctx.master.h;
  const fx = fillsAxis(F.x, F.w, ctx.master.w);
  const fy = fillsAxis(F.y, F.h, ctx.master.h);
  if (fx && fy) return Math.max(sx, sy);
  if (fx) return sx;
  if (fy) return sy;
  const room = Math.min(roomOn(F.x, F.w, ctx.master.w, trim.w), roomOn(F.y, F.h, ctx.master.h, trim.h));
  return Math.max(ctx.k, Math.min(Math.sqrt(sx * sy), room));
}

/** Output position of one axis: the pin's grid coordinate, the scaled span hung from it. Filled axes pin the centre. */
function place(lo: number, size: number, M: number, T: number, offset: number, out: number): number {
  const p = pinAt(lo, size, M);
  return offset + ((lo + p * size) / M) * T - p * out;
}

/** Master frame `F` in the output (design px, full-canvas coordinates); rotation, skew and `fitted` kept. */
export function gridFrame(F: Frame, ctx: RuleContext, c?: number): Frame {
  const { metrics: m, master } = ctx;
  // Edge to edge on one axis only: the stretched grid itself, both axes (an explicit scale keeps proportions).
  const stretch = c === undefined && fillsAxis(F.x, F.w, master.w) !== fillsAxis(F.y, F.h, master.h);
  const scale = c ?? gridScale(F, ctx);
  const w = F.w * (stretch ? m.trim.w / master.w : scale);
  const h = F.h * (stretch ? m.trim.h / master.h : scale);
  return {
    x: place(F.x, F.w, master.w, m.trim.w, m.bleed, w),
    y: place(F.y, F.h, master.h, m.trim.h, m.bleed, h),
    w,
    h,
    ...(F.rotation ? { rotation: F.rotation } : {}),
    ...(F.shear ? { shear: F.shear } : {}),
    ...(F.fitted ? { fitted: true as const } : {}),
  };
}

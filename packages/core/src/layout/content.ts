/**
 * Content fit (layout v2, D30). The layers that carry the design — subjects, decorations, text — are fitted
 * as a group into the output's free space instead of shrinking the whole master canvas into it:
 * - size scale `c = clamp(min(R.w/U.w, R.h/U.h), k, K)`: the group's master bounds U fill the region R, never
 *   smaller than v1 (k, contain of the master) nor larger than the master's cover scale K;
 * - positions spread per axis `px = max(c, R.w/U.w)`, `py = max(c, R.h/U.h)` around R's centre, so a tall or
 *   wide output is used edge to edge; sizes grow no faster than distances, so layers don't start to overlap.
 */
import type { Frame } from '../model';
import type { RuleContext } from './context';

/** How one group of master frames maps into a region of the output. */
export interface GroupMap {
  /** Size scale. */
  c: number;
  /** Position spread per axis (≥ c). */
  px: number;
  py: number;
  /** Union of the group's master frames (design px). */
  U: Frame;
  /** Output region the group fills (design px). */
  R: Frame;
}

export function unionOf(frames: readonly Frame[]): Frame | null {
  if (frames.length === 0) return null;
  const x0 = Math.min(...frames.map((f) => f.x));
  const y0 = Math.min(...frames.map((f) => f.y));
  const x1 = Math.max(...frames.map((f) => f.x + f.w));
  const y1 = Math.max(...frames.map((f) => f.y + f.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The k / K bounds of v1 and the cover scale. */
export function coverScale(ctx: RuleContext): number {
  return Math.max(ctx.metrics.trim.w / ctx.master.w, ctx.metrics.trim.h / ctx.master.h);
}

export function groupMap(frames: readonly Frame[], R: Frame, ctx: RuleContext): GroupMap | null {
  const U = unionOf(frames);
  if (!U || U.w <= 0 || U.h <= 0) return null;
  const fit = Math.min(R.w / U.w, R.h / U.h);
  const c = Math.min(Math.max(fit, ctx.k), Math.max(ctx.k, coverScale(ctx)));
  return { c, px: Math.max(c, R.w / U.w), py: Math.max(c, R.h / U.h), U, R };
}

/** Centre of master frame `F` in the output, spread around R's centre. */
export function mappedCentre(F: Frame, g: GroupMap): { cx: number; cy: number } {
  const { U, R } = g;
  return {
    cx: R.x + R.w / 2 + (F.x + F.w / 2 - (U.x + U.w / 2)) * g.px,
    cy: R.y + R.h / 2 + (F.y + F.h / 2 - (U.y + U.h / 2)) * g.py,
  };
}

/** Master frame `F` in the output: size `F·c` at its spread centre (rotation kept). */
export function mappedFrame(F: Frame, g: GroupMap): Frame {
  const { cx, cy } = mappedCentre(F, g);
  const w = F.w * g.c;
  const h = F.h * g.c;
  return { x: cx - w / 2, y: cy - h / 2, w, h, ...(F.rotation ? { rotation: F.rotation } : {}), ...(F.shear ? { shear: F.shear } : {}), ...(F.fitted ? { fitted: true as const } : {}) };
}

/** The output regions: stack → all content in S; side → visuals on the right half and text in a left column (each takes all of S when alone). */
export function regions(ctx: RuleContext, hasVisuals: boolean, hasText: boolean): { visuals: Frame; text: Frame } {
  const S = ctx.metrics.safe;
  if (ctx.family === 'stack' || !hasVisuals || !hasText) return { visuals: S, text: S };
  const half = S.w / 2;
  return { visuals: { x: S.x + half, y: S.y, w: half, h: S.h }, text: { x: S.x, y: S.y, w: half, h: S.h } };
}

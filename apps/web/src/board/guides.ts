/**
 * Alignment guides on the board (T13.5): while a node is dragged, its left / centre / right edge (and top /
 * middle / bottom) snaps to the same edge of another node within `threshold` flow px, and a guide line is drawn
 * there. Pure; positions and sizes in flow coordinates.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Alignment {
  /** Snapped top-left, per axis (undefined: no guide on that axis). */
  x?: number;
  y?: number;
  /** Where to draw the guide lines. */
  vertical?: number;
  horizontal?: number;
}

/** Best match on one axis: the moving span's three anchors against every other span's three anchors. */
function axis(start: number, size: number, others: { start: number; size: number }[], threshold: number): { pos: number; line: number } | null {
  const anchors = (s: number, l: number) => [s, s + l / 2, s + l];
  let best: { pos: number; line: number; d: number } | null = null;
  for (const o of others)
    for (const [i, mine] of anchors(start, size).entries())
      for (const theirs of anchors(o.start, o.size)) {
        const d = Math.abs(theirs - mine);
        if (d <= threshold && (!best || d < best.d)) best = { pos: theirs - (i * size) / 2, line: theirs, d };
      }
  return best && { pos: best.pos, line: best.line };
}

export function align(moving: Rect, others: readonly Rect[], threshold = 6): Alignment {
  const vx = axis(moving.x, moving.w, others.map((o) => ({ start: o.x, size: o.w })), threshold);
  const hy = axis(moving.y, moving.h, others.map((o) => ({ start: o.y, size: o.h })), threshold);
  return { ...(vx ? { x: vx.pos, vertical: vx.line } : {}), ...(hy ? { y: hy.pos, horizontal: hy.line } : {}) };
}

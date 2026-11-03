/**
 * D84 (Edit all, All sizes): an edit made to a layer in one size carried to the same layer in the others, in
 * proportion to each canvas — a move of 5 % of the canvas is a move of 5 % of each canvas, a resize by a factor
 * resizes each by the same factor about its own centre, a turn or lean is added to each. Pure.
 */
import type { Frame, ProjectDoc } from './model';
import type { SourceResult } from './sources';

type Canvas = { width: number; height: number };

/** Where `target` (the layer's frame in another size, `to`) goes for the edit `before` → `after` made in a size `from`. */
export function carryFrame(before: Frame, after: Frame, from: Canvas, to: Canvas, target: Frame): Frame {
  const dcx = (after.x + after.w / 2 - (before.x + before.w / 2)) / from.width;
  const dcy = (after.y + after.h / 2 - (before.y + before.h / 2)) / from.height;
  const kw = before.w > 0 ? after.w / before.w : 1;
  const kh = before.h > 0 ? after.h / before.h : 1;
  const w = target.w * kw;
  const h = target.h * kh;
  const cx = target.x + target.w / 2 + dcx * to.width;
  const cy = target.y + target.h / 2 + dcy * to.height;
  const rotation = (target.rotation ?? 0) + (after.rotation ?? 0) - (before.rotation ?? 0);
  const shear = (target.shear ?? 0) + (after.shear ?? 0) - (before.shear ?? 0);
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    ...(rotation ? { rotation } : {}),
    ...(shear ? { shear } : {}),
    ...(target.fitted ? { fitted: true as const } : {}),
  };
}

/** Runs `edit` on each of `ids` in turn, as one result (one undo step); the first refusal stops it. */
export function forEachOutput(doc: ProjectDoc, ids: readonly string[], edit: (doc: ProjectDoc, id: string) => SourceResult): SourceResult {
  let next = doc;
  for (const id of ids) {
    const r = edit(next, id);
    if (!r.ok) return r;
    next = r.doc;
  }
  return { ok: true, doc: next };
}

/**
 * Picture frames fitted to their visible pixels (D37).
 *
 * A picture layer used to be drawn `contain` inside its frame, transparent margins and all, so the frame was
 * bigger than what you see and stretching it only letterboxed the picture. A `fitted` frame instead hugs the
 * picture's visible (non-transparent) pixels, and the picture fills it — stretching with it.
 *
 * Frames become fitted by `fitFrames`, which the board runs whenever it knows a picture's trim (the bounding
 * box of its visible pixels, measured in the browser): every unfitted frame of a picture layer becomes the
 * visible part of the picture as it was drawn (contain), so nothing moves on screen. New placements, library
 * inserts and old projects all go through it. Replacing a picture clears its frames' flags (`unfitPictures`),
 * so the new picture is fitted into the old frame.
 *
 * Backgrounds are never fitted (they cover their frame). Pure: no DOM.
 */
import type { AssetSize } from './layout/types';
import type { Frame, NFrame, ProjectDoc } from './model';
import { layerSources, type LayerEffect, type LayerSource } from './processes';
import { sizeInDesignPx } from './render';

type Box = { x: number; y: number; w: number; h: number };
const FULL: Box = { x: 0, y: 0, w: 1, h: 1 };

/** A picture layer that can be fitted: an image or vector with a file, not a background. */
export const isFittable = (l: Pick<LayerSource, 'content' | 'behavesLike' | 'nested'>): boolean =>
  !l.nested && (l.content.kind === 'image' || l.content.kind === 'vector') && !!l.content.assetId && l.behavesLike !== 'background';

function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 1e-9 && h > 1e-9 ? { x, y, w, h } : null;
}

/**
 * The part of the picture a fitted frame shows, in picture coords (0..1): its trim, within the process crop
 * (the crop itself when they don't overlap).
 */
export function visibleRect(trim: Box | undefined, effect?: Pick<LayerEffect, 'crop'>): Box {
  const crop = effect?.crop ?? FULL;
  return intersect(crop, trim ?? FULL) ?? crop;
}

/**
 * Where that part sits in the layer's *effective* content (after crop, mirror and quarter turn), 0..1. The
 * renderer mirrors first, then turns (`rotate(r) scaleX(-1)`), so this does the same.
 */
export function effectiveTrim(trim: Box | undefined, effect?: Pick<LayerEffect, 'crop' | 'flipX' | 'rotate'>): Box {
  const crop = effect?.crop ?? FULL;
  const v = visibleRect(trim, effect);
  let t: Box = { x: (v.x - crop.x) / crop.w, y: (v.y - crop.y) / crop.h, w: v.w / crop.w, h: v.h / crop.h };
  if (effect?.flipX) t = { ...t, x: 1 - t.x - t.w };
  switch (effect?.rotate ?? 0) {
    case 90:
      return { x: 1 - t.y - t.h, y: t.x, w: t.h, h: t.w };
    case 180:
      return { x: 1 - t.x - t.w, y: 1 - t.y - t.h, w: t.w, h: t.h };
    case 270:
      return { x: t.y, y: 1 - t.x - t.w, w: t.h, h: t.w };
    default:
      return t;
  }
}

/** The layer's effective content size (crop and quarter turn applied), in picture px. */
function effectiveSize(size: AssetSize, effect?: Pick<LayerEffect, 'crop' | 'rotate'>): { width: number; height: number } {
  const w = size.width * (effect?.crop?.w ?? 1);
  const h = size.height * (effect?.crop?.h ?? 1);
  return effect && effect.rotate % 180 !== 0 ? { width: h, height: w } : { width: w, height: h };
}

/** A frame's turn and lean as a 2×2 map (CSS `rotate(r) skewX(s)` about the centre). */
function turnOf(f: Pick<Frame, 'rotation' | 'shear'>) {
  const r = ((f.rotation ?? 0) * Math.PI) / 180;
  const k = Math.tan(((f.shear ?? 0) * Math.PI) / 180);
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return (x: number, y: number) => ({ x: c * (x + k * y) - s * y, y: s * (x + k * y) + c * y });
}

/**
 * The fitted version of an unfitted frame: the visible part of the picture as it is drawn now (the whole
 * effective content contained and centred in the frame), as a frame of its own — same turn and lean, its
 * centre moved along the turned frame so it lands on exactly the same pixels.
 */
export function fittedFrame(frame: Frame, size: AssetSize, effect?: Pick<LayerEffect, 'crop' | 'flipX' | 'rotate'>): Frame {
  const eff = effectiveSize(size, effect);
  const s = Math.min(frame.w / eff.width, frame.h / eff.height);
  const view = { w: eff.width * s, h: eff.height * s };
  const t = effectiveTrim(size.trim, effect);
  const w = view.w * t.w;
  const h = view.h * t.h;
  // Centre of the visible part relative to the frame centre, before the frame's turn.
  const dx = -view.w / 2 + view.w * (t.x + t.w / 2);
  const dy = -view.h / 2 + view.h * (t.y + t.h / 2);
  const d = turnOf(frame)(dx, dy);
  const cx = frame.x + frame.w / 2 + d.x;
  const cy = frame.y + frame.h / 2 + d.y;
  return { ...frame, x: cx - w / 2, y: cy - h / 2, w, h, fitted: true };
}

/**
 * Where a fitted picture goes inside its frame (frame-local px): the view is the whole frame, the turned crop
 * window ("pane") fills it, and the picture is placed so its visible part fills the pane — stretched on
 * each axis to the frame. Same nesting as `effectBoxes` (view › pane turned › picture).
 */
export function fillBoxes(frame: Pick<Frame, 'w' | 'h'>, size: AssetSize, effect?: Pick<LayerEffect, 'crop' | 'rotate'>) {
  const v = visibleRect(size.trim, effect);
  const quarter = (effect?.rotate ?? 0) % 180 !== 0;
  const view = { x: 0, y: 0, w: frame.w, h: frame.h };
  const pane = { w: quarter ? frame.h : frame.w, h: quarter ? frame.w : frame.h };
  const paneAt = { x: (frame.w - pane.w) / 2, y: (frame.h - pane.h) / 2 };
  const kx = pane.w / (size.width * v.w);
  const ky = pane.h / (size.height * v.h);
  const img = { x: -v.x * size.width * kx + 0, y: -v.y * size.height * ky + 0, w: size.width * kx, h: size.height * ky }; // + 0: no -0
  return { view, pane: { ...paneAt, ...pane }, img };
}

/** The picture asset behind a layer (its file and effect), or null if the layer can't be fitted. */
function pictureOf(l: LayerSource, assets: Record<string, AssetSize>) {
  if (!isFittable(l) || (l.content.kind !== 'image' && l.content.kind !== 'vector') || !l.content.assetId) return null;
  const size = assets[l.content.assetId];
  // Only once the trim is known: fitting to the whole picture would be wrong for one with margins.
  return size && size.width > 0 && size.height > 0 && size.trim ? { size, effect: l.effect } : null;
}

/**
 * A fitted picture's own proportions: width / height of its visible part (after crop and quarter turn), in
 * pixels; undefined until its trim is measured or for a layer that isn't a picture. A stretch changes the
 * frame, not this, so a reset can always bring the picture back to its shape.
 */
export function pictureAspect(l: LayerSource, assets: Record<string, AssetSize>): number | undefined {
  const p = pictureOf(l, assets);
  if (!p) return undefined;
  const eff = effectiveSize(p.size, p.effect);
  const t = effectiveTrim(p.size.trim, p.effect);
  return (eff.width * t.w) / (eff.height * t.h);
}

/**
 * Every unfitted frame of a picture layer whose trim is known becomes fitted, in place (placements on every
 * composition, output overrides with a whole frame, frozen output frames). Returns `doc` itself when nothing
 * changes, so callers can compare.
 */
export function fitFrames(doc: ProjectDoc, assets: Record<string, AssetSize>): ProjectDoc {
  const pictures = new Map<string, NonNullable<ReturnType<typeof pictureOf>>>();
  for (const l of layerSources(doc)) {
    const p = pictureOf(l, assets);
    if (p) pictures.set(l.id, p);
  }
  if (pictures.size === 0) return doc;
  let changed = false;

  const compositions = doc.compositions.map((c) => {
    const { width: W, height: H } = sizeInDesignPx(c.size);
    let placements = c.placements;
    for (const [id, n] of Object.entries(c.placements)) {
      const p = pictures.get(id);
      if (!p || n.fitted) continue;
      const f = fittedFrame({ ...n, x: n.x * W, y: n.y * H, w: n.w * W, h: n.h * H }, p.size, p.effect);
      const next: NFrame = { ...n, x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H, fitted: true };
      placements = { ...placements, [id]: next };
      changed = true;
    }
    return placements === c.placements ? c : { ...c, placements };
  });

  const outputs = doc.outputs.map((o) => {
    let out = o;
    const overrides = o.overrides.map((ov) => {
      const p = pictures.get(ov.sourceId);
      const f = ov.frame;
      if (!p || !f || f.fitted || f.x === undefined || f.y === undefined || f.w === undefined || f.h === undefined) return ov;
      changed = true;
      return { ...ov, frame: { ...f, ...fittedFrame({ ...f, x: f.x, y: f.y, w: f.w, h: f.h }, p.size, p.effect) } };
    });
    if (overrides.some((ov, i) => ov !== o.overrides[i])) out = { ...out, overrides };
    if (o.frozen) {
      const items = o.frozen.items.map((it) => {
        const p = pictures.get(it.sourceId);
        if (!p || it.frame.fitted) return it;
        changed = true;
        return { ...it, frame: fittedFrame(it.frame, p.size, p.effect) };
      });
      if (items.some((it, i) => it !== o.frozen?.items[i])) out = { ...out, frozen: { ...o.frozen, items } };
    }
    return out;
  });

  return changed ? { ...doc, compositions, outputs } : doc;
}

/**
 * Before a layer's picture is replaced: its frames (and those of processes drawing the same picture) stop
 * being fitted, so `fitFrames` fits the new picture into the old frame. Returns `doc` when nothing changes.
 */
export function unfitPictures(doc: ProjectDoc, layerIds: ReadonlySet<string>): ProjectDoc {
  const drop = <T extends { fitted?: true }>(f: T): T => {
    const { fitted: _f, ...rest } = f;
    void _f;
    return rest as T;
  };
  let changed = false;
  const compositions = doc.compositions.map((c) => {
    let placements = c.placements;
    for (const [id, n] of Object.entries(c.placements))
      if (layerIds.has(id) && n.fitted) {
        placements = { ...placements, [id]: drop(n) };
        changed = true;
      }
    return placements === c.placements ? c : { ...c, placements };
  });
  const outputs = doc.outputs.map((o) => {
    const overrides = o.overrides.map((ov) => (layerIds.has(ov.sourceId) && ov.frame?.fitted ? ((changed = true), { ...ov, frame: drop(ov.frame) }) : ov));
    const items = o.frozen?.items.map((it) => (layerIds.has(it.sourceId) && it.frame.fitted ? ((changed = true), { ...it, frame: drop(it.frame) }) : it));
    return { ...o, overrides, ...(o.frozen && items ? { frozen: { ...o.frozen, items } } : {}) };
  });
  return changed ? { ...doc, compositions, outputs } : doc;
}

/** The layers that draw a source's picture: the source and the processes built on it. */
export function layersOfPicture(doc: ProjectDoc, sourceId: string): Set<string> {
  const source = doc.sources.find((s) => s.id === sourceId);
  const assetId = source && (source.content.kind === 'image' || source.content.kind === 'vector') ? source.content.assetId : null;
  const ids = new Set([sourceId]);
  if (assetId) for (const l of layerSources(doc)) if ((l.content.kind === 'image' || l.content.kind === 'vector') && l.content.assetId === assetId && doc.processes.some((p) => p.id === l.id)) ids.add(l.id);
  return ids;
}

/**
 * Layout guides (D42, owner 2026-10-22, "Core Preset Guide"): a master preview can have guide artboards —
 * Square, Vertical, Horizontal — each the same design arranged for that shape. Every output of the master takes
 * its layout from whichever of the master and its guides is closest to its own shape, then the stretched grid
 * (D38) adapts that to its exact size. Guides only hold positions: the master decides which layers exist and
 * their order; a layer a guide hasn't placed yet uses the master's position.
 */
import { compositionById, edgeId, newComposition, withComposition } from './graph';
import { gridFrame } from './layout/grid';
import { canvasMetrics, LIMITS, type Composition, type Frame, type GuideFamily, type NFrame, type ProjectDoc, type Size, type SourceContent } from './model';
import { sizeInDesignPx, toDesignFrame } from './render';
import type { SourceResult } from './sources';

export const GUIDE_FAMILIES: readonly GuideFamily[] = ['square', 'vertical', 'horizontal'];
export const GUIDE_LABEL: Record<GuideFamily, string> = { square: 'Square guide', vertical: 'Vertical guide', horizontal: 'Horizontal guide' };
/** Guide shapes (width / height): square 1:1, vertical 5:8, horizontal 7:4. */
export const GUIDE_RATIO: Record<GuideFamily, number> = { square: 1, vertical: 5 / 8, horizontal: 7 / 4 };

const ratioOf = (size: { width: number; height: number }) => size.width / size.height;

/** The family a shape belongs to: the guide ratio it is closest to (on a log scale, so 2:1 and 1:2 are as far from 1:1). */
export function familyOfShape(size: { width: number; height: number }): GuideFamily {
  const r = Math.log(ratioOf(size));
  return GUIDE_FAMILIES.reduce((best, f) => (Math.abs(Math.log(GUIDE_RATIO[f]) - r) < Math.abs(Math.log(GUIDE_RATIO[best]) - r) ? f : best));
}

/** The master a composition belongs to (itself unless it is a guide). */
export const masterOf = (doc: ProjectDoc, id: string): string => compositionById(doc, id)?.guide?.of ?? id;

/** A master's guides (not the master itself). */
export const guidesOf = (doc: ProjectDoc, masterId: string): Composition[] => doc.compositions.filter((c) => c.guide?.of === masterId);

/** D50: the master's layout of a shape family — the master itself for its own shape, else its guide (if added). */
export function layoutOf(doc: ProjectDoc, compositionId: string, family: GuideFamily): Composition | undefined {
  const master = compositionById(doc, masterOf(doc, compositionId));
  if (!master) return undefined;
  return familyOfShape(sizeInDesignPx(master.size)) === family ? master : guidesOf(doc, master.id).find((g) => g.guide?.family === family);
}

/**
 * The composition an output of `compositionId` takes its positions from: the layout chosen for it (D50, when
 * added), else of the master and its guides the one whose shape is closest to `trim` (log of the ratio).
 * Without guides, the master.
 */
export function guideFor(doc: ProjectDoc, compositionId: string, trim: { w: number; h: number }, chosen?: GuideFamily): Composition | undefined {
  const master = compositionById(doc, masterOf(doc, compositionId));
  if (!master) return undefined;
  const picked = chosen ? layoutOf(doc, master.id, chosen) : undefined;
  if (picked) return picked;
  const r = Math.log(trim.w / trim.h);
  const far = (c: Composition) => Math.abs(Math.log(ratioOf(sizeInDesignPx(c.size))) - r);
  return [master, ...guidesOf(doc, master.id)].reduce((best, c) => (far(c) < far(best) ? c : best));
}

/** A guide's artboard: the master's longer side, in the family's shape. */
export function guideSize(master: Size, family: GuideFamily): Size {
  const long = Math.max(master.width, master.height);
  const r = GUIDE_RATIO[family];
  return r >= 1 ? { width: long, height: Math.round(long / r), unit: master.unit } : { width: Math.round(long * r), height: long, unit: master.unit };
}

/** A master placement as the stretched grid puts it on another artboard (normalized to that artboard). */
function mapPlacement(n: NFrame, from: { width: number; height: number }, to: Size): NFrame {
  const toPx = sizeInDesignPx(to);
  const master = { w: from.width, h: from.height };
  const metrics = canvasMetrics({ size: { ...to } });
  const f: Frame = gridFrame(toDesignFrame(n, from), { metrics, family: 'stack', master, k: Math.min(toPx.width / from.width, toPx.height / from.height) });
  return {
    x: f.x / toPx.width,
    y: f.y / toPx.height,
    w: f.w / toPx.width,
    h: f.h / toPx.height,
    ...(f.rotation ? { rotation: f.rotation } : {}),
    ...(f.shear ? { shear: f.shear } : {}),
    ...(f.fitted ? { fitted: true as const } : {}),
  };
}

/**
 * Adds the guides a master doesn't have yet — the families other than its own shape's — each seeded from the
 * master through the stretched grid, so it starts out exactly as outputs of that shape look now. `ids` gives the
 * new compositions' ids by family; they sit below the master on the board.
 */
export function addGuides(doc: ProjectDoc, masterId: string, ids: Partial<Record<GuideFamily, string>>): SourceResult {
  const master = compositionById(doc, masterId);
  if (!master || master.guide) return { ok: false, error: 'not_found' };
  const own = familyOfShape(sizeInDesignPx(master.size));
  const have = new Set(guidesOf(doc, masterId).map((g) => g.guide?.family));
  const missing = GUIDE_FAMILIES.filter((f) => f !== own && !have.has(f));
  if (doc.compositions.length + missing.length > LIMITS.maxCompositions) return { ok: false, error: 'limit' };
  const from = sizeInDesignPx(master.size);
  let next = doc;
  missing.forEach((family, i) => {
    const id = ids[family];
    if (!id) return;
    const size = guideSize(master.size, family);
    const comp: Composition = {
      ...newComposition(id, GUIDE_LABEL[family], { x: master.board.x, y: master.board.y + 900 * (i + 1) }, size),
      layers: [...master.layers],
      placements: Object.fromEntries(Object.entries(master.placements).map(([layer, n]) => [layer, mapPlacement(n, from, size)])),
      guide: { of: masterId, family },
    };
    const edges = doc.edges.filter((e) => e.kind === 'layer' && e.to === masterId).map((e) => ({ ...e, id: edgeId(e.from, id, 'layer'), to: id }));
    next = { ...next, compositions: [...next.compositions, comp], edges: [...next.edges, ...edges] };
  });
  return { ok: true, doc: next };
}

/** Turns a guide back into an ordinary master preview (it stops being picked for the master's outputs). */
export function detachGuide(doc: ProjectDoc, id: string): SourceResult {
  const comp = compositionById(doc, id);
  if (!comp?.guide) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withComposition(doc, id, (c) => {
    const { guide: _guide, ...rest } = c;
    void _guide;
    return rest;
  }) };
}

/**
 * D43: the picture an output of shape `trim` draws for this content — its vertical or horizontal slot when the
 * output's shape is that family and the slot is filled, else the main picture. Null when it has no picture.
 */
export function pictureForShape(content: SourceContent, trim: { w: number; h: number }): string | null {
  if (content.kind !== 'image' && content.kind !== 'vector') return null;
  const family = familyOfShape({ width: trim.w, height: trim.h });
  // Page 3: a background may have only its vertical and horizontal pictures; a square output uses either.
  return (family !== 'square' ? content.variants?.[family] : undefined) ?? content.assetId ?? content.variants?.horizontal ?? content.variants?.vertical ?? null;
}

/** A source with its picture for this output's shape in place of the main one (itself when that's the same). */
export function withPictureForShape<T extends { content: SourceContent }>(source: T, trim: { w: number; h: number }): T {
  const c = source.content;
  if (c.kind !== 'image' && c.kind !== 'vector') return source;
  const id = pictureForShape(c, trim);
  return id === c.assetId ? source : { ...source, content: { ...c, assetId: id } };
}

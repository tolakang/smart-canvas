/**
 * Layout guides (D42, owner 2026-10-22, "Core Preset Guide"): a master preview can have guide artboards —
 * Square, Vertical, Horizontal — each the same design arranged for that shape. Every output of the master takes
 * its layout from whichever of the master and its guides is closest to its own shape, then the stretched grid
 * (D38) adapts that to its exact size. Guides only hold positions: the master decides which layers exist and
 * their order; a layer a guide hasn't placed yet uses the master's position.
 */
import { compositionById, edgeId, MAIN, mainComposition, newComposition } from './graph';
import { gridFrame } from './layout/grid';
import { canvasMetrics, LIMITS, type Composition, type Frame, type GuideFamily, type NFrame, type ProjectDoc, type Size, type SourceContent } from './model';
import { layerSources } from './layers';
import { compositionScene, sizeInDesignPx, toDesignFrame, type RenderScene } from './render';
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

/**
 * M1: where a layer sits in a master's layouts (the master and its guides), as fractions of each layout's
 * canvas, skipping the layout `except` and layouts that don't place it. Editors map these onto their own canvas
 * by relative position, so the layer can snap to "its spot in the Square layout" while another is edited.
 */
export function layerSpots(doc: ProjectDoc, compositionId: string, layerId: string, except?: string): { layout: string; label: string; frame: NFrame }[] {
  const master = compositionById(doc, masterOf(doc, compositionId));
  if (!master) return [];
  return [master, ...guidesOf(doc, master.id)].flatMap((c) => {
    const frame = c.id === except ? undefined : c.placements[layerId];
    const family = c.guide?.family ?? familyOfShape(sizeInDesignPx(c.size));
    return frame ? [{ layout: c.id, label: family[0]?.toUpperCase() + family.slice(1), frame }] : [];
  });
}

/** A guide's artboard: the master's longer side, in the family's shape. */
export function guideSize(master: Size, family: GuideFamily): Size {
  const long = Math.max(master.width, master.height);
  const r = GUIDE_RATIO[family];
  return r >= 1 ? { width: long, height: Math.round(long / r), unit: master.unit } : { width: Math.round(long * r), height: long, unit: master.unit };
}

/** A master placement as the stretched grid puts it on another artboard (normalized to that artboard). */
export function mapPlacement(n: NFrame, from: { width: number; height: number }, to: Size): NFrame {
  const toPx = sizeInDesignPx(to);
  const master = { w: from.width, h: from.height };
  const metrics = canvasMetrics({ size: { ...to } });
  const f: Frame = gridFrame(toDesignFrame(n, from), { metrics, master, k: Math.min(toPx.width / from.width, toPx.height / from.height) });
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

/**
 * D43: the picture an output of shape `trim` draws for this content — its vertical or horizontal slot when the
 * output is in that family and the slot is filled, else the main (square) picture. The family is the layout the
 * output was moved to (`chosen`, D50) when it has one, else its shape's. Null when it has no picture.
 */
export function pictureForShape(content: SourceContent, trim: { w: number; h: number }, chosen?: GuideFamily): string | null {
  if (content.kind !== 'image' && content.kind !== 'vector') return null;
  const family = chosen ?? familyOfShape({ width: trim.w, height: trim.h });
  // Page 3: a background may have only its vertical and horizontal pictures; a square output uses either.
  return (family !== 'square' ? content.variants?.[family] : undefined) ?? content.assetId ?? content.variants?.horizontal ?? content.variants?.vertical ?? null;
}

/** A source with its picture for this output's shape in place of the main one (itself when that's the same). */
export function withPictureForShape<T extends { content: SourceContent }>(source: T, trim: { w: number; h: number }, chosen?: GuideFamily): T {
  const c = source.content;
  if (c.kind !== 'image' && c.kind !== 'vector') return source;
  const id = pictureForShape(c, trim, chosen);
  return id === c.assetId ? source : { ...source, content: { ...c, assetId: id } };
}

/**
 * A composition (default: the master preview): its wired rows, visible, back→front. Each uses its placement;
 * a background with no placement yet covers the whole canvas; anything else unplaced is skipped.
 * D42 / D50: a layout of the master (a guide) draws the master's layers, in its order and wiring, at its own
 * positions. Owner, 2026-11-03 (D80): a layer the layout hasn't placed yet sits where the stretched grid puts the
 * master's (`mapPlacement`, its proportions kept, as the layout engine places it in that layout's Previews), not at the master's place stretched to
 * the layout's shape; and each layer draws its picture for the layout's family (a logo set's vertical or horizontal
 * picture, D74, as its Previews do).
 */
export function masterScene(doc: ProjectDoc, compositionId: string = MAIN): RenderScene {
  const comp = compositionById(doc, compositionId) ?? mainComposition(doc);
  const master = comp.guide ? compositionById(doc, comp.guide.of) : undefined;
  if (master && comp.guide) {
    const family = comp.guide.family;
    const from = sizeInDesignPx(master.size);
    const mapped = Object.fromEntries(Object.entries(master.placements).map(([id, n]) => [id, comp.placements[id] ?? mapPlacement(n, from, comp.size)]));
    const trim = { w: sizeInDesignPx(comp.size).width, h: sizeInDesignPx(comp.size).height };
    const byId = new Map(layerSources(doc).map((s) => [s.id, withPictureForShape(s, trim, family)]));
    const main = new Map(layerSources(doc).map((s) => [s.id, s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null]));
    const scene = compositionScene(doc, { ...master, size: comp.size, placements: { ...mapped, ...comp.placements } }, (id) => byId.get(id));
    return {
      ...scene,
      items: scene.items.map((it) => {
        const c = byId.get(it.sourceId)?.content;
        const id = c && (c.kind === 'image' || c.kind === 'vector') ? c.assetId : null;
        return id && id !== main.get(it.sourceId) ? { ...it, assetId: id } : it;
      }),
    };
  }
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  return compositionScene(doc, comp, (id) => byId.get(id));
}

/**
 * D82: whether layer `sourceId` sits somewhere else in layout `layoutId` than Square puts it — moved there by hand,
 * or Square moved since the layout was made (D42 seeds a layout from Square, then it keeps its own places). A layer
 * with no place of its own, or one still where the stretched grid puts Square's (within 0.2 % of the canvas), is
 * not. False for the master itself.
 */
export function movedInLayout(doc: ProjectDoc, layoutId: string, sourceId: string): boolean {
  const c = compositionById(doc, layoutId);
  const own = c?.guide ? c.placements[sourceId] : undefined;
  if (!c?.guide || !own) return false;
  const master = compositionById(doc, c.guide.of);
  const n = master?.placements[sourceId];
  if (!master || !n) return true;
  const m = mapPlacement(n, sizeInDesignPx(master.size), c.size);
  const near = (a = 0, b = 0, tol = 0.002) => Math.abs(a - b) <= tol;
  return !(near(own.x, m.x) && near(own.y, m.y) && near(own.w, m.w) && near(own.h, m.h) && near(own.rotation, m.rotation, 0.05) && near(own.shear, m.shear, 0.05));
}

/** D82, "Follow Square again": drops layout `layoutId`'s own place of a layer (and its edit history there). */
export function followMaster(doc: ProjectDoc, layoutId: string, sourceId: string): SourceResult {
  const c = compositionById(doc, layoutId);
  if (!c?.guide) return { ok: false, error: 'not_found' };
  if (!c.placements[sourceId]) return { ok: true, doc };
  const { [sourceId]: _p, ...placements } = c.placements;
  void _p;
  const transforms = c.transforms && c.transforms.layers[sourceId] ? { transforms: { ...c.transforms, layers: Object.fromEntries(Object.entries(c.transforms.layers).filter(([id]) => id !== sourceId)) } } : {};
  return { ok: true, doc: { ...doc, compositions: doc.compositions.map((x) => (x.id === layoutId ? { ...x, placements, ...transforms } : x)) } };
}

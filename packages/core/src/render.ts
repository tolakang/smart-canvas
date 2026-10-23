/**
 * What the OutputRenderer draws: a canvas size and items back→front (ADAPTATION-RULES: highest port first).
 * The layout engine produces these for outputs; a composition's come straight from its placements.
 */
import { compositionById, MAIN, mainComposition, wiredLayers } from './graph';
import { layerSources } from './layers';
import { toDesignPx, type Composition, type Frame, type InputSource, type NFrame, type ProjectDoc, type Size, type TextStyle } from './model';

/** One drawn layer. Same shape as the engine's LayoutItem minus bookkeeping. Frame in design px; rotation in degrees. */
export interface RenderItem {
  sourceId: string;
  frame: Frame;
  fontSizePx?: number;
  /** Explicit line breaks from the text-fit engine; when absent the renderer wraps itself. */
  lines?: string[];
  /** An output's text-style override, drawn on top of the source's own style. */
  style?: Partial<TextStyle>;
  /** D43: the picture to draw instead of the source's main one (its vertical / horizontal slot). */
  assetId?: string;
}

export interface RenderScene {
  width: number; // design px (incl. bleed for outputs)
  height: number;
  items: RenderItem[];
}

export function sizeInDesignPx(size: Size): { width: number; height: number } {
  return { width: toDesignPx(size.width, size.unit), height: toDesignPx(size.height, size.unit) };
}

export function toDesignFrame(n: NFrame, canvas: { width: number; height: number }): Frame {
  return {
    x: n.x * canvas.width,
    y: n.y * canvas.height,
    w: n.w * canvas.width,
    h: n.h * canvas.height,
    ...(n.rotation ? { rotation: n.rotation } : {}), ...(n.shear ? { shear: n.shear } : {}), ...(n.fitted ? { fitted: true as const } : {}),
  };
}

/**
 * A composition (default: the master preview): its wired rows, visible, back→front. Each uses its placement;
 * a background with no placement yet covers the whole canvas; anything else unplaced is skipped.
 */
export function masterScene(doc: ProjectDoc, compositionId: string = MAIN): RenderScene {
  const comp = compositionById(doc, compositionId) ?? mainComposition(doc);
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  // D42 / D50: a layout of the master (a guide) draws the master's layers, in its order and wiring, at its own
  // positions — a layer it hasn't placed yet at the master's.
  const master = comp.guide ? compositionById(doc, comp.guide.of) : undefined;
  if (master) {
    return compositionScene(doc, { ...master, size: comp.size, placements: { ...master.placements, ...comp.placements } }, (id) => byId.get(id));
  }
  return compositionScene(doc, comp, (id) => byId.get(id));
}

/** A composition's scene with its rows looked up by `layer`. */
export function compositionScene(doc: ProjectDoc, comp: Composition, layer: (id: string) => InputSource | undefined): RenderScene {
  const canvas = sizeInDesignPx(comp.size);
  const wired = wiredLayers(doc, comp.id);
  const items: RenderItem[] = [];
  for (const s of [...comp.layers].reverse().flatMap((id) => layer(id) ?? [])) {
    if (!s.visible || !wired.has(s.id)) continue;
    const placement = comp.placements[s.id];
    if (placement) items.push({ sourceId: s.id, frame: toDesignFrame(placement, canvas) });
    else if (s.behavesLike === 'background') items.push({ sourceId: s.id, frame: { x: 0, y: 0, w: canvas.width, h: canvas.height } });
  }
  return { ...canvas, items };
}

/** A frame's turn and lean about its centre as CSS: `rotate(r) skewX(s)` (shear after rotation, as Frame says). */
export function frameTransform(frame: { rotation?: number; shear?: number }): string {
  return [frame.rotation ? `rotate(${frame.rotation}deg)` : '', frame.shear ? `skewX(${frame.shear}deg)` : ''].filter(Boolean).join(' ');
}

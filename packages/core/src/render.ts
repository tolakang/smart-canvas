/**
 * What the OutputRenderer draws: a canvas size and items back→front (ADAPTATION-RULES: highest port first).
 * The layout engine produces these for outputs; a composition's come straight from its placements.
 */
import { compositionById, MAIN, mainComposition, wiredLayers } from './graph';
import { toDesignPx, type Frame, type NFrame, type ProjectDoc, type Size, type TextStyle } from './model';

/** One drawn layer. Same shape as the engine's LayoutItem minus bookkeeping. Frame in design px; rotation in degrees. */
export interface RenderItem {
  sourceId: string;
  frame: Frame;
  fontSizePx?: number;
  /** Explicit line breaks from the text-fit engine; when absent the renderer wraps itself. */
  lines?: string[];
  /** An output's text-style override, drawn on top of the source's own style. */
  style?: Partial<TextStyle>;
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
    ...(n.rotation ? { rotation: n.rotation } : {}),
  };
}

/**
 * A composition (default: the main preview): its wired rows, visible, back→front. Each uses its placement;
 * a background with no placement yet covers the whole canvas; anything else unplaced is skipped.
 */
export function masterScene(doc: ProjectDoc, compositionId: string = MAIN): RenderScene {
  const comp = compositionById(doc, compositionId) ?? mainComposition(doc);
  const canvas = sizeInDesignPx(comp.size);
  const wired = wiredLayers(doc, comp.id);
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  const items: RenderItem[] = [];
  for (const s of [...comp.layers].reverse().flatMap((id) => byId.get(id) ?? [])) {
    if (!s.visible || !wired.has(s.id)) continue;
    const placement = comp.placements[s.id];
    if (placement) items.push({ sourceId: s.id, frame: toDesignFrame(placement, canvas) });
    else if (s.behavesLike === 'background') items.push({ sourceId: s.id, frame: { x: 0, y: 0, w: canvas.width, h: canvas.height } });
  }
  return { ...canvas, items };
}

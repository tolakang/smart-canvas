/**
 * What the OutputRenderer draws: a canvas size and items back→front (ADAPTATION-RULES: highest port first).
 * The layout engine produces these for outputs; the main preview's come straight from master placements.
 */
import { toDesignPx, type Frame, type NFrame, type ProjectDoc, type Size } from './model';

/** One drawn layer. Same shape as the engine's LayoutItem minus bookkeeping. Frame in design px; rotation in degrees. */
export interface RenderItem {
  sourceId: string;
  frame: Frame;
  fontSizePx?: number;
  /** Explicit line breaks from the text-fit engine; when absent the renderer wraps itself. */
  lines?: string[];
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
 * The main preview: inputs wired into main (D12), visible, back→front by port. Each uses its master
 * placement; a background with no placement yet covers the whole canvas; anything else unplaced is skipped.
 */
export function masterScene(doc: ProjectDoc): RenderScene {
  const canvas = sizeInDesignPx(doc.master.size);
  const wired = new Set(doc.wires.filter((w) => w.to === 'main').map((w) => w.from));
  const items: RenderItem[] = [];
  for (const s of [...doc.sources].sort((a, b) => b.port - a.port)) {
    if (!s.visible || !wired.has(s.id)) continue;
    const placement = doc.master.placements[s.id];
    if (placement) items.push({ sourceId: s.id, frame: toDesignFrame(placement, canvas) });
    else if (s.behavesLike === 'background') items.push({ sourceId: s.id, frame: { x: 0, y: 0, w: canvas.width, h: canvas.height } });
  }
  return { ...canvas, items };
}

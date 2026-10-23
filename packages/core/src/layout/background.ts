/** background behaviour: images cover the full canvas (incl. bleed) around their focal point; fills are the full rect. */
import type { CanvasMetrics, Frame, InputSource } from '../model';
import { layerAssetSize } from '../layers';
import type { LayoutDeps } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Cover-fit of an `iw×ih` image on `W×H`, keeping focal `(fx, fy)` as central as the edges allow. */
export function coverFrame(W: number, H: number, iw: number, ih: number, focal: { x: number; y: number }): Frame {
  const s = Math.max(W / iw, H / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: clamp(W / 2 - focal.x * w, W - w, 0), y: clamp(H / 2 - focal.y * h, H - h, 0), w, h };
}

export function backgroundFrame(source: InputSource, m: CanvasMetrics, deps: LayoutDeps): Frame {
  const { w: W, h: H } = m.full;
  const c = source.content;
  if (c.kind === 'image' || c.kind === 'vector') {
    const size = layerAssetSize(source, deps.assets);
    if (size) return coverFrame(W, H, size.width, size.height, c.focal);
  }
  return { x: 0, y: 0, w: W, h: H };
}

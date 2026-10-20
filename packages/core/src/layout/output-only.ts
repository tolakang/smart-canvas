/**
 * Output-only layers (T12.4, ADAPTATION-RULES "Output-only layers"): default frames by behaviour, in the
 * output's own canvas. Not in a content group: they don't move the composition's layers.
 */
import { DEFAULTS, type CanvasMetrics, type Frame, type InputSource } from '../model';
import { layerAssetSize, type LayerEffect } from '../processes';
import { backgroundFrame } from './background';
import type { LayoutDeps } from './types';

/** Intrinsic aspect (w/h) of an image or vector source; 1 when unknown. */
function aspectOf(source: InputSource & { effect?: LayerEffect }, deps: LayoutDeps): number {
  const size = layerAssetSize(source, deps.assets);
  return size ? size.width / size.height : 1;
}

export function outputOnlyFrame(source: InputSource & { effect?: LayerEffect }, m: CanvasMetrics, deps: LayoutDeps): Frame {
  const S = m.safe;
  switch (source.behavesLike) {
    case 'background':
      return backgroundFrame(source, m, deps);
    case 'logo': {
      // Top-right corner of S, 15% of S's short side wide (at least the minimum logo width).
      const w = Math.max(0.15 * Math.min(S.w, S.h), (DEFAULTS.minLogoWidthPct / 100) * Math.min(m.trim.w, m.trim.h));
      const h = w / aspectOf(source, deps);
      return { x: S.x + S.w - w, y: S.y, w, h };
    }
    case 'text':
      // A full-width band over the bottom quarter of S.
      return { x: S.x, y: S.y + 0.75 * S.h, w: S.w, h: 0.25 * S.h };
    default: {
      // subject / decoration: contain-fit into 60% of S, centred.
      const a = aspectOf(source, deps);
      const s = Math.min((0.6 * S.w) / a, 0.6 * S.h);
      const w = s * a;
      return { x: S.x + (S.w - w) / 2, y: S.y + (S.h - s) / 2, w, h: s };
    }
  }
}

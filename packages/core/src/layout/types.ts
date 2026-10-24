/** Engine contract (ADAPTATION-RULES "layout engine v1"). */
import type { TextMeasure } from '../fonts';
import type { CanvasMetrics, Frame } from '../model';

export type LayoutWarning = 'text-overflow' | 'min-logo' | 'clamped';

export interface LayoutItem {
  sourceId: string;
  frame: Frame;
  fontSizePx?: number;
  lines?: string[];
  overridden: boolean;
  warnings: LayoutWarning[];
  /** D43: the picture drawn for this output when it isn't the input's main one (its vertical / horizontal slot). */
  assetId?: string;
}

export interface LayoutResult {
  metrics: CanvasMetrics;
  items: LayoutItem[]; // back→front (highest port first)
}

/**
 * A picture's intrinsic size, and (D37) where its visible pixels are: the bounding box of the non-transparent
 * pixels, 0..1 of the picture. Measured in the browser; absent until measured (or when there's no alpha).
 */
export interface AssetSize {
  width: number;
  height: number;
  trim?: { x: number; y: number; w: number; h: number };
}

export interface LayoutDeps {
  measure: TextMeasure;
  /** Intrinsic size of each asset by id (images and vectors). */
  assets: Record<string, AssetSize>;
}

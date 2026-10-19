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
}

export interface LayoutResult {
  metrics: CanvasMetrics;
  family: 'stack' | 'side';
  items: LayoutItem[]; // back→front (highest port first)
}

export interface LayoutDeps {
  measure: TextMeasure;
  /** Intrinsic size of each asset by id (images and vectors). */
  assets: Record<string, { width: number; height: number }>;
}

/** Per-output values every rule needs (ADAPTATION-RULES "Definitions"). */
import type { CanvasMetrics, Frame } from '../model';

export interface RuleContext {
  metrics: CanvasMetrics;
  family: 'stack' | 'side';
  /** Master canvas in design px. */
  master: { w: number; h: number };
  /** Uniform contain-scale of master onto trim: min(Wt/Wm, Ht/Hm). */
  k: number;
}

/** Centre of a master frame, normalized 0..1 of the master canvas. */
export function anchorOf(f: Frame, master: { w: number; h: number }): { ax: number; ay: number } {
  return { ax: (f.x + f.w / 2) / master.w, ay: (f.y + f.h / 2) / master.h };
}

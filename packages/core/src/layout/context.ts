/** Per-output values every rule needs (ADAPTATION-RULES "Definitions"). */
import type { CanvasMetrics } from '../model';

export interface RuleContext {
  metrics: CanvasMetrics;
  /** Reported in the result; v3 places every family the same way. */
  family: 'stack' | 'side';
  /** Master canvas in design px. */
  master: { w: number; h: number };
  /** Uniform contain-scale of master onto trim: min(Wt/Wm, Ht/Hm). */
  k: number;
}


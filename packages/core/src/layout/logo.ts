/** logo behaviour (v3): placed on the stretched grid like any layer, then raised to the minimum width from its pin. */
import { DEFAULTS, type Frame } from '../model';
import type { RuleContext } from './context';
import { gridFrame, gridScale } from './grid';
import type { LayoutWarning } from './types';

export function logoFrame(f: Frame, ctx: RuleContext): { frame: Frame; warnings: LayoutWarning[] } {
  const { metrics: m } = ctx;
  const c = gridScale(f, ctx);
  const minW = (DEFAULTS.minLogoWidthPct / 100) * Math.min(m.trim.w, m.trim.h);
  if (f.w * c >= minW || f.w <= 0) return { frame: gridFrame(f, ctx, c), warnings: [] };
  return { frame: gridFrame(f, ctx, minW / f.w), warnings: ['min-logo'] };
}

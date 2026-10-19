/** logo behaviour: scaled by k with a minimum width, flush to the safe-rect corner nearest its master position. */
import { DEFAULTS, type Frame } from '../model';
import { anchorOf, type RuleContext } from './context';
import type { LayoutWarning } from './types';

export function logoFrame(f: Frame, ctx: RuleContext): { frame: Frame; warnings: LayoutWarning[] } {
  const { metrics: m, k } = ctx;
  let w = f.w * k;
  let h = f.h * k;
  const warnings: LayoutWarning[] = [];
  const minW = (DEFAULTS.minLogoWidthPct / 100) * Math.min(m.trim.w, m.trim.h);
  if (w < minW) {
    h *= minW / w;
    w = minW;
    warnings.push('min-logo');
  }
  const { ax, ay } = anchorOf(f, ctx.master);
  const S = m.safe;
  const x = ax < 0.5 ? S.x : S.x + S.w - w;
  const y = ay < 0.5 ? S.y : S.y + S.h - h;
  return { frame: { x, y, w, h, ...(f.rotation ? { rotation: f.rotation } : {}) }, warnings };
}

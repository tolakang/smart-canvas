/** subject and decoration behaviours: scaled by k, anchored like the master; subjects stay inside the safe rect. */
import type { Frame } from '../model';
import { anchorOf, type RuleContext } from './context';
import type { LayoutWarning } from './types';

/** Size `F·k` centred on the master anchor (stack) or in the right half of the safe rect (side). */
export function anchoredFrame(f: Frame, ctx: RuleContext): Frame {
  const { metrics: m, k } = ctx;
  const { ax, ay } = anchorOf(f, ctx.master);
  const w = f.w * k;
  const h = f.h * k;
  const cx = ctx.family === 'side' ? m.safe.x + (0.5 + 0.5 * ax) * m.safe.w : m.bleed + ax * m.trim.w;
  const cy = m.bleed + ay * m.trim.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h, ...(f.rotation ? { rotation: f.rotation } : {}) };
}

const EPS = 1e-9;

/** Scales down to fit `S` if larger, then translates to stay inside it; warns `clamped` if either happened. */
export function clampIntoSafe(frame: Frame, safe: Frame): { frame: Frame; warnings: LayoutWarning[] } {
  const s = Math.min(1, safe.w / frame.w, safe.h / frame.h);
  const w = frame.w * s;
  const h = frame.h * s;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  let x = cx - w / 2;
  let y = cy - h / 2;
  x = Math.min(Math.max(x, safe.x), safe.x + safe.w - w);
  y = Math.min(Math.max(y, safe.y), safe.y + safe.h - h);
  const moved = Math.abs(x - frame.x) > EPS || Math.abs(y - frame.y) > EPS || s < 1;
  return { frame: { ...frame, x, y, w, h }, warnings: moved ? ['clamped'] : [] };
}

export function subjectFrame(f: Frame, ctx: RuleContext): { frame: Frame; warnings: LayoutWarning[] } {
  return clampIntoSafe(anchoredFrame(f, ctx), ctx.metrics.safe);
}

export function decorationFrame(f: Frame, ctx: RuleContext): Frame {
  return anchoredFrame(f, ctx);
}

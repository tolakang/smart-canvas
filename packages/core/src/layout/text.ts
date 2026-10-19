/** text behaviour placement: boxes follow the master anchor, text is fitted inside. */
import type { TextMeasure } from '../fonts';
import type { Frame, TextStyle } from '../model';
import { anchorOf, type RuleContext } from './context';
import { clampIntoSafe } from './subject';
import { fitText, wrapAt, type TextFit } from './text-fit';
import type { LayoutWarning } from './types';

export interface TextJob {
  text: string;
  style: TextStyle;
  /** Master text box in design px. */
  master: Frame;
  /** override.style.fontSizePx: used as-is, no fit. */
  fixedSizePx?: number;
}

export interface TextPlaced {
  frame: Frame;
  fontSizePx: number;
  lines: string[];
  warnings: LayoutWarning[];
}

function fit(job: TextJob, box: { w: number; h: number }, ctx: RuleContext, measure: TextMeasure): TextFit {
  if (job.fixedSizePx !== undefined) return wrapAt(job.text, job.style, box, job.fixedSizePx, measure);
  return fitText(job.text, job.style, box, job.style.fontSizePx * ctx.k, measure);
}

const result = (frame: Frame, f: TextFit, warnings: LayoutWarning[] = []): TextPlaced => ({
  frame,
  fontSizePx: f.fontSizePx,
  lines: f.lines,
  warnings: f.overflow ? [...warnings, 'text-overflow'] : warnings,
});

/** Stack: box `min(F.w/Wm·Wt, S.w) × F.h/Hm·Ht` centred on the master anchor, clamped into S, text fitted inside. */
export function stackTextFrame(F: Frame, ctx: RuleContext): { frame: Frame; warnings: LayoutWarning[] } {
  const { metrics: m } = ctx;
  const w = Math.min((F.w / ctx.master.w) * m.trim.w, m.safe.w);
  const h = Math.min((F.h / ctx.master.h) * m.trim.h, m.safe.h);
  const { ax, ay } = anchorOf(F, ctx.master);
  const box: Frame = { x: m.bleed + ax * m.trim.w - w / 2, y: m.bleed + ay * m.trim.h - h / 2, w, h, ...(F.rotation ? { rotation: F.rotation } : {}) };
  return clampIntoSafe(box, m.safe);
}

/** Fits text inside an already-decided frame (stack box, or an override frame). */
export function fitInFrame(job: TextJob, frame: Frame, ctx: RuleContext, measure: TextMeasure, warnings: LayoutWarning[] = []): TextPlaced {
  return result(frame, fit(job, frame, ctx, measure), warnings);
}

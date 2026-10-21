/** text behaviour placement: stack boxes follow the master anchor; the side family stacks all text in one left column. */
import type { TextMeasure } from '../fonts';
import type { Frame, TextStyle } from '../model';
import { lineHeightOf } from '../text';
import { mappedCentre, type GroupMap } from './content';
import type { RuleContext } from './context';
import { clampIntoSafe } from './subject';
import { fitText, gridSize, wrapAt, type TextFit } from './text-fit';
import type { LayoutWarning } from './types';

export interface TextJob {
  text: string;
  style: TextStyle;
  /** Master text box in design px. */
  master: Frame;
  /** override.style.fontSizePx: used as-is, no fit. */
  fixedSizePx?: number;
  /** Start size scale (v2: its content group's c): fit starts at `style.fontSizePx · scale`. */
  scale: number;
}

export interface TextPlaced {
  frame: Frame;
  fontSizePx: number;
  lines: string[];
  warnings: LayoutWarning[];
}

function fit(job: TextJob, box: { w: number; h: number }, measure: TextMeasure): TextFit {
  if (job.fixedSizePx !== undefined) return wrapAt(job.text, job.style, box, job.fixedSizePx, measure);
  return fitText(job.text, job.style, box, job.style.fontSizePx * job.scale, measure);
}

const result = (frame: Frame, f: TextFit, warnings: LayoutWarning[] = []): TextPlaced => ({
  frame,
  fontSizePx: f.fontSizePx,
  lines: f.lines,
  warnings: f.overflow ? [...warnings, 'text-overflow'] : warnings,
});

/**
 * Stack (v2): box `min(F.w·px, R.w) × min(F.h·c, R.h)` at the text's spread centre in its content group —
 * it widens with the layout, the height follows the size scale — clamped into S, text fitted inside.
 */
export function stackTextFrame(F: Frame, g: GroupMap, ctx: RuleContext): { frame: Frame; warnings: LayoutWarning[] } {
  const { metrics: m } = ctx;
  const w = Math.min(F.w * g.px, g.R.w);
  const h = Math.min(F.h * g.c, g.R.h);
  const { cx, cy } = mappedCentre(F, g);
  const box: Frame = { x: cx - w / 2, y: cy - h / 2, w, h, ...(F.rotation ? { rotation: F.rotation } : {}), ...(F.shear ? { shear: F.shear } : {}), ...(F.fitted ? { fitted: true as const } : {}) };
  return clampIntoSafe(box, m.safe);
}

/** Fits text inside an already-decided frame (stack box, or an override frame). */
export function fitInFrame(job: TextJob, frame: Frame, measure: TextMeasure, warnings: LayoutWarning[] = []): TextPlaced {
  return result(frame, fit(job, frame, measure), warnings);
}

/**
 * Side family: one column (`col`: the left half of S, or all of S when there are no visuals), texts in master
 * top→bottom order with a 2%·Ht gap, the block centred vertically in S. A block taller than S scales every
 * size down to fit (≥ minFontPx; warns clamped).
 */
export function sideColumn(jobs: TextJob[], ctx: RuleContext, measure: TextMeasure, col: Frame = { ...ctx.metrics.safe, w: 0.5 * ctx.metrics.safe.w }): TextPlaced[] {
  const { metrics: m } = ctx;
  const S = m.safe;
  const w = col.w;
  const gap = 0.02 * m.trim.h;
  const heightOf = (job: TextJob, f: TextFit) => f.lines.length * f.fontSizePx * lineHeightOf(job.style, job.text);
  let rows = jobs
    .map((job, index) => ({ job, index, fit: fit(job, { w, h: Math.min(job.master.h * job.scale, S.h) }, measure) }))
    .sort((a, b) => a.job.master.y - b.job.master.y);
  const blockOf = () => rows.reduce((sum, r) => sum + heightOf(r.job, r.fit), 0) + gap * Math.max(0, rows.length - 1);
  let block = blockOf();
  const shrunk = block > S.h;
  if (shrunk) {
    // S.h/blockHeight, with the fixed gaps kept out of the scaled part so the block really fits S.
    const gaps = gap * Math.max(0, rows.length - 1);
    const factor = Math.max(0, S.h - gaps) / (block - gaps);
    rows = rows.map((r) => {
      if (r.job.fixedSizePx !== undefined) return r;
      const scaled = wrapAt(r.job.text, r.job.style, { w, h: Infinity }, gridSize(r.fit.fontSizePx * factor), measure);
      return { ...r, fit: { ...scaled, overflow: r.fit.overflow || scaled.overflow } };
    });
    block = blockOf();
  }
  const placed: TextPlaced[] = new Array<TextPlaced>(jobs.length);
  let y = S.y + Math.max(0, (S.h - block) / 2);
  for (const r of rows) {
    const h = heightOf(r.job, r.fit);
    placed[r.index] = result({ x: col.x, y, w, h }, r.fit, shrunk ? ['clamped'] : []);
    y += h + gap;
  }
  return placed;
}

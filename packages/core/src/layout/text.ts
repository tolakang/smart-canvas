/** text behaviour (v3): the text box is placed on the stretched grid (grid.ts); the text is fitted inside it. */
import type { TextMeasure } from '../fonts';
import type { Frame, TextStyle } from '../model';
import { fitText, wrapAt, type TextFit } from './text-fit';
import type { LayoutWarning } from './types';

export interface TextJob {
  text: string;
  style: TextStyle;
  /** Master text box in design px. */
  master: Frame;
  /** override.style.fontSizePx: used as-is, no fit. */
  fixedSizePx?: number;
  /** Start size scale (v3: the box's grid scale): fit starts at `style.fontSizePx · scale`. */
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

/** Fits text inside an already-decided frame (its grid box, or an override frame). */
export function fitInFrame(job: TextJob, frame: Frame, measure: TextMeasure, warnings: LayoutWarning[] = []): TextPlaced {
  return result(frame, fit(job, frame, measure), warnings);
}


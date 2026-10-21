import { expect } from 'vitest';
/** Test fixtures for the layout engine (not exported from the package). */
import { MAIN, mainComposition, withComposition } from '../graph';
import type { NFrame, OutputNode, ProjectDoc } from '../model';
import { connectSource } from '../ports';
import { createProjectDoc } from '../project';
import type { LayoutDeps } from './types';

/** ADAPTATION-RULES mock measure: width = text.length · 0.5 · fontPx. */
export const mockMeasure: LayoutDeps['measure'] = (text, fontPx) => text.length * 0.5 * fontPx;

export function output(patch: Partial<OutputNode> = {}): OutputNode {
  return { id: 'o1', label: 'Out', size: { width: 1080, height: 1350, unit: 'px' }, family: 'auto', overrides: [], board: { x: 0, y: 0 }, ...patch };
}

/** New 3000×3000 project with the 4 defaults wired and one output. */
export function project(out: OutputNode = output()): ProjectDoc {
  let doc = createProjectDoc('P');
  for (const id of ['background', 'subject', 'headline', 'logo']) {
    const r = connectSource(doc, id);
    if (r.ok) doc = r.doc;
  }
  return { ...doc, outputs: [out] };
}

/** Sets a master placement from a design-px frame on the master canvas. */
export function place(doc: ProjectDoc, id: string, f: { x: number; y: number; w: number; h: number; rotation?: number; shear?: number }): ProjectDoc {
  const { width: W, height: H } = mainComposition(doc).size;
  const n: NFrame = { x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H, ...(f.rotation ? { rotation: f.rotation } : {}), ...(f.shear ? { shear: f.shear } : {}) };
  return withComposition(doc, MAIN, (c) => ({ ...c, placements: { ...c.placements, [id]: n } }));
}

/** Frames compared to 6 decimals (float noise from normalized placements). */
export function expectFrame(actual: { x: number; y: number; w: number; h: number } | undefined, expected: { x: number; y: number; w: number; h: number }): void {
  expect(actual).toBeDefined();
  for (const key of ['x', 'y', 'w', 'h'] as const) expect(actual?.[key], key).toBeCloseTo(expected[key], 6);
}

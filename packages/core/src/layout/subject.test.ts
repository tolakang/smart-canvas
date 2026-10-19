import { describe, expect, it } from 'vitest';
import type { ProjectDoc } from '../model';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const item = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);
const subjectFrame = { x: 900, y: 750, w: 1200, h: 1800 };

describe('subject', () => {
  it('example A: stack on 1080×1350', () => {
    const r = item(place(project(), 'subject', subjectFrame), 'subject');
    expectFrame(r?.frame, { x: 324, y: 418.5, w: 432, h: 648 });
    expect(r?.warnings).toEqual([]);
  });

  it('example B: side on 3000×1000 (auto family)', () => {
    const doc = place(project(output({ size: { width: 3000, height: 1000, unit: 'px' } })), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 2025, y: 250, w: 400, h: 600 });
  });

  it('offsets by the bleed', () => {
    const doc = place(project(output({ size: { width: 1080, height: 1350, unit: 'px' }, bleedMm: 25.4 })), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 324 + 96, y: 418.5 + 96, w: 432, h: 648 });
  });

  it('translates into the safe rect and warns clamped', () => {
    const doc = place(project(), 'subject', { x: 0, y: 0, w: 600, h: 600 });
    const r = item(doc, 'subject');
    expect(r?.frame).toEqual({ x: 54, y: 54, w: 216, h: 216 });
    expect(r?.warnings).toEqual(['clamped']);
  });

  it('scales down to fit the safe rect', () => {
    const doc = place(project(), 'subject', { x: -1000, y: 0, w: 5000, h: 1000 }); // 1800×360 at k=0.36
    const r = item(doc, 'subject');
    expect(r?.frame.w).toBeCloseTo(972);
    expect(r?.frame.h).toBeCloseTo(194.4);
    expect(r?.frame.x).toBeCloseTo(54);
    expect(r?.warnings).toEqual(['clamped']);
  });

  it('keeps master rotation', () => {
    const doc = place(project(), 'subject', { ...subjectFrame, rotation: 15 });
    expect(item(doc, 'subject')?.frame.rotation).toBe(15);
  });

  it('is skipped while it has no master placement', () => {
    const doc = project();
    const placements = Object.fromEntries(Object.entries(doc.master.placements).filter(([id]) => id !== 'subject'));
    expect(item({ ...doc, master: { ...doc.master, placements } }, 'subject')).toBeUndefined();
  });
});

describe('decoration', () => {
  function withDecoration(doc: ProjectDoc): ProjectDoc {
    return { ...doc, sources: doc.sources.map((s) => (s.id === 'subject' ? { ...s, behavesLike: 'decoration' } : s)) };
  }

  it('follows the subject rule (example A) without clamping', () => {
    expectFrame(item(withDecoration(place(project(), 'subject', subjectFrame)), 'subject')?.frame, { x: 324, y: 418.5, w: 432, h: 648 });
    const r = item(withDecoration(place(project(), 'subject', { x: -300, y: 0, w: 600, h: 600 })), 'subject');
    expectFrame(r?.frame, { x: -108, y: 27, w: 216, h: 216 }); // anchor (0, 0.1): off the left edge
    expect(r?.warnings).toEqual([]);
  });

  it('goes to the right half in the side family', () => {
    const doc = withDecoration(place(project(output({ size: { width: 3000, height: 1000, unit: 'px' } })), 'subject', subjectFrame));
    expect(item(doc, 'subject')?.frame.x).toBeCloseTo(2025);
  });
});

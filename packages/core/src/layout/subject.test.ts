import { describe, expect, it } from 'vitest';
import { MAIN, withComposition } from '../graph';
import type { ProjectDoc } from '../model';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const item = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);
const subjectFrame = { x: 900, y: 750, w: 1200, h: 1800 };

/** Example G (v2): the project's subject and headline fitted as one content group. */
const onlySubject = (doc: ProjectDoc): ProjectDoc => ({ ...doc, edges: doc.edges.filter((e) => e.from !== 'headline') });

describe('subject (v2 content fit)', () => {
  it('example A: alone on 1080×1350 it fills the safe rect up to the cover scale, centred', () => {
    const r = item(onlySubject(place(project(), 'subject', subjectFrame)), 'subject');
    expectFrame(r?.frame, { x: 270, y: 270, w: 540, h: 810 }); // c = clamp(min(972/1200, 1242/1800), 0.36, 0.45) = 0.45
    expect(r?.warnings).toEqual([]);
  });

  it('example G: with the headline, the pair fills the safe rect and spreads vertically', () => {
    const r = item(place(project(), 'subject', subjectFrame), 'subject');
    // U = {240,750,2520,2010}; c = px = 972/2520; py = 1242/2010; centre (540, 675 − 105·py)
    expectFrame(r?.frame, { x: 308.571429, y: 262.976546, w: 462.857143, h: 694.285714 });
  });

  it('example B: side on 3000×1000 (auto family): visuals fill the right half of S', () => {
    const doc = place(project(output({ size: { width: 3000, height: 1000, unit: 'px' } })), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 1925, y: 50, w: 600, h: 900 });
    // Without text the visuals take all of S.
    expectFrame(item(onlySubject(doc), 'subject')?.frame, { x: 1200, y: 50, w: 600, h: 900 });
  });

  it('offsets by the bleed', () => {
    const doc = place(project(output({ size: { width: 1080, height: 1350, unit: 'px' }, bleedMm: 25.4 })), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 308.571429 + 96, y: 262.976546 + 96, w: 462.857143, h: 694.285714 });
  });

  it('a lone small subject grows to the cover scale (the badge in a story / a wide banner)', () => {
    const badge = { x: 300, y: 300, w: 1000, h: 1000 };
    const story = onlySubject(place(project(output({ size: { width: 1080, height: 1920, unit: 'px' } })), 'subject', badge));
    expectFrame(item(story, 'subject')?.frame, { x: 220, y: 640, w: 640, h: 640 });
    const banner = onlySubject(place(project(output({ size: { width: 1200, height: 630, unit: 'px' } })), 'subject', badge));
    expectFrame(item(banner, 'subject')?.frame, { x: 400, y: 115, w: 400, h: 400 });
  });

  it('never shrinks below k: a frame still wider than S is scaled down to S and warns clamped', () => {
    // c = clamp(972/5000, k = 0.36, 0.45) = 0.36 → 1800 wide, then fitted into S.
    const r = item(onlySubject(place(project(), 'subject', { x: -1000, y: 0, w: 5000, h: 1000 })), 'subject');
    expect(r?.frame.x).toBeCloseTo(54);
    expect(r?.frame.w).toBeCloseTo(972);
    expect(r?.frame.h).toBeCloseTo(194.4);
    expect(r?.warnings).toEqual(['clamped']);
  });

  it('keeps master rotation', () => {
    const doc = place(project(), 'subject', { ...subjectFrame, rotation: 15 });
    expect(item(doc, 'subject')?.frame.rotation).toBe(15);
  });

  it('is skipped while it has no master placement', () => {
    const doc = project();
    const without = withComposition(doc, MAIN, (c) => ({ ...c, placements: Object.fromEntries(Object.entries(c.placements).filter(([id]) => id !== 'subject')) }));
    expect(item(without, 'subject')).toBeUndefined();
  });
});

describe('decoration', () => {
  function withDecoration(doc: ProjectDoc): ProjectDoc {
    return { ...doc, sources: doc.sources.map((s) => (s.id === 'subject' ? { ...s, behavesLike: 'decoration' } : s)) };
  }

  it('is placed like a subject in its content group (example G)', () => {
    expectFrame(item(withDecoration(place(project(), 'subject', subjectFrame)), 'subject')?.frame, { x: 308.571429, y: 262.976546, w: 462.857143, h: 694.285714 });
  });

  it('is not clamped: it may bleed off the edges', () => {
    // With the headline, a decoration hanging off the master's left edge keeps hanging off.
    const r = item(withDecoration(place(project(), 'subject', { x: -300, y: 0, w: 600, h: 600 })), 'subject');
    expect(r?.frame.x).toBeLessThan(54);
    expect(r?.warnings).toEqual([]);
  });

  it('goes to the right half in the side family', () => {
    const doc = withDecoration(place(project(output({ size: { width: 3000, height: 1000, unit: 'px' } })), 'subject', subjectFrame));
    expect(item(doc, 'subject')?.frame.x).toBeCloseTo(1925);
  });
});

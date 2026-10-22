import { describe, expect, it } from 'vitest';
import { MAIN, mainComposition, withComposition } from './graph';
import { addGuides, detachGuide, familyOfShape, guideFor, guideSize, guidesOf } from './guides';
import { computeLayout } from './layout';
import { expectFrame, mockMeasure, output, place, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const deps = { measure: mockMeasure, assets: {} };
const ids = { vertical: 'gv', horizontal: 'gh', square: 'gs' };
const subjectFrame = { x: 900, y: 750, w: 1200, h: 1800 };
const at = (doc: ProjectDoc, width: number, height: number) =>
  computeLayout({ ...doc, outputs: [output({ size: { width, height, unit: 'px' } })] }, 'o1', deps).items.find((i) => i.sourceId === 'subject')?.frame;

describe('layout guides (D42)', () => {
  it('shapes: square 1:1, vertical 5:8, horizontal 7:4 — each output belongs to the closest', () => {
    expect(familyOfShape({ width: 2400, height: 2400 })).toBe('square');
    expect(familyOfShape({ width: 1080, height: 1350 })).toBe('square'); // 4:5 is closer to 1:1 than to 5:8
    expect(familyOfShape({ width: 1080, height: 1920 })).toBe('vertical');
    expect(familyOfShape({ width: 300, height: 250 })).toBe('square');
    expect(familyOfShape({ width: 1200, height: 628 })).toBe('horizontal');
    expect(familyOfShape({ width: 728, height: 90 })).toBe('horizontal');
    expect(guideSize({ width: 3000, height: 3000, unit: 'px' }, 'vertical')).toEqual({ width: 1875, height: 3000, unit: 'px' });
    expect(guideSize({ width: 3000, height: 3000, unit: 'px' }, 'horizontal')).toEqual({ width: 3000, height: 1714, unit: 'px' });
  });

  it('a square master gets a vertical and a horizontal guide, with its rows and wires', () => {
    const doc = ok(addGuides(place(project(), 'subject', subjectFrame), MAIN, ids));
    const guides = guidesOf(doc, MAIN);
    expect(guides.map((g) => [g.id, g.label, g.guide?.family])).toEqual([
      ['gv', 'Vertical guide', 'vertical'],
      ['gh', 'Horizontal guide', 'horizontal'],
    ]);
    for (const g of guides) {
      expect(g.layers).toEqual(mainComposition(doc).layers);
      expect(doc.edges.filter((e) => e.kind === 'layer' && e.to === g.id).map((e) => e.from).sort()).toEqual(doc.edges.filter((e) => e.kind === 'layer' && e.to === MAIN).map((e) => e.from).sort());
    }
    expect(addGuides(doc, MAIN, ids).ok && guidesOf(ok(addGuides(doc, MAIN, ids)), MAIN)).toHaveLength(2); // nothing new to add
  });

  it('seeded guides change nothing: every output looks exactly as before', () => {
    const before = place(project(), 'subject', subjectFrame);
    const after = ok(addGuides(before, MAIN, ids));
    for (const [w, h] of [[1080, 1920], [1200, 628], [728, 90], [2400, 2400], [900, 1600]] as const) {
      const a = at(before, w, h);
      const b = at(after, w, h);
      expect(b).toBeDefined();
      expectFrame(b, a ?? { x: 0, y: 0, w: 0, h: 0 });
    }
  });

  it('each output takes its positions from the closest guide; a layer the guide lacks keeps the master position', () => {
    let doc = ok(addGuides(place(project(), 'subject', subjectFrame), MAIN, ids));
    expect(guideFor(doc, MAIN, { w: 1080, h: 1920 })?.id).toBe('gv');
    expect(guideFor(doc, MAIN, { w: 728, h: 90 })?.id).toBe('gh');
    expect(guideFor(doc, MAIN, { w: 2400, h: 2400 })?.id).toBe(MAIN);
    // Move the subject to the top of the vertical guide: a story follows; a square post doesn't.
    doc = withComposition(doc, 'gv', (c) => ({ ...c, placements: { ...c.placements, subject: { x: 0.1, y: 0.05, w: 0.8, h: 0.3 } } }));
    // Guide 1875×3000 → story 1080×1920: g = √(0.576·0.64); centred across, top edge at 5% of the height.
    const g = Math.sqrt((1080 / 1875) * (1920 / 3000));
    expectFrame(at(doc, 1080, 1920), { x: 540 - (1500 * g) / 2, y: 96, w: 1500 * g, h: 900 * g });
    const square = at(ok(addGuides(place(project(), 'subject', subjectFrame), MAIN, ids)), 2400, 2400);
    expect(at(doc, 2400, 2400)).toEqual(square);
    // Without a placement on the guide, the master's position (through the grid) is used.
    doc = withComposition(doc, 'gv', (c) => ({ ...c, placements: Object.fromEntries(Object.entries(c.placements).filter(([k]) => k !== 'subject')) }));
    expectFrame(at(doc, 1080, 1920), at(place(project(), 'subject', subjectFrame), 1080, 1920) ?? { x: 0, y: 0, w: 0, h: 0 });
  });

  it('a detached guide is an ordinary master preview again (no longer picked)', () => {
    const doc = ok(detachGuide(ok(addGuides(place(project(), 'subject', subjectFrame), MAIN, ids)), 'gv'));
    expect(guidesOf(doc, MAIN).map((g) => g.id)).toEqual(['gh']);
    expect(guideFor(doc, MAIN, { w: 1080, h: 1920 })?.id).toBe(MAIN);
  });
});

describe('background pictures for vertical / horizontal outputs (D43)', () => {
  const withVariants = (doc: ProjectDoc): ProjectDoc => ({
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'background' ? { ...s, kind: 'image', content: { kind: 'image', assetId: 'main', focal: { x: 0.5, y: 0.5 }, variants: { vertical: 'tall', horizontal: 'wide' } } } : s,
    ),
  });
  const bg = (doc: ProjectDoc, width: number, height: number) =>
    computeLayout({ ...doc, outputs: [output({ size: { width, height, unit: 'px' } })] }, 'o1', { measure: mockMeasure, assets: { main: { width: 1000, height: 1000 }, tall: { width: 1000, height: 2000 }, wide: { width: 3000, height: 1000 } } }).items.find((i) => i.sourceId === 'background');

  it('each output draws the slot of its shape; square ones the main picture', () => {
    const doc = withVariants(project());
    expect(bg(doc, 1080, 1920)?.assetId).toBe('tall');
    expect(bg(doc, 728, 90)?.assetId).toBe('wide');
    expect(bg(doc, 2400, 2400)?.assetId).toBeUndefined(); // the main picture
  });

  it('the cover is computed on that picture: a 1:2 picture on a 1080×1920 story', () => {
    // cover: s = max(1080/1000, 1920/2000) = 1.08 → 1080×2160, centred vertically
    expectFrame(bg(withVariants(project()), 1080, 1920)?.frame, { x: 0, y: -120, w: 1080, h: 2160 });
  });

  it('an empty slot falls back to the main picture', () => {
    const doc = { ...withVariants(project()), sources: withVariants(project()).sources.map((s) => (s.id === 'background' && s.content.kind === 'image' ? { ...s, content: { ...s.content, variants: { vertical: 'tall' } } } : s)) };
    expect(bg(doc, 728, 90)?.assetId).toBeUndefined();
  });
});

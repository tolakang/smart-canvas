import { describe, expect, it } from 'vitest';
import { fillBoxes, keepAspect } from './fit';
import { MAIN, mainComposition, withComposition } from './graph';
import { addGuides, familyOfShape, followMaster, guideFor, guideSize, guidesOf, layerSpots, masterScene, movedInLayout } from './guides';
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
});

describe('a layer\'s spot in the other layouts (M1)', () => {
  it('lists the layer\'s frame (fractions) in the master and each guide that places it, except the one edited', () => {
    let doc = ok(addGuides(place(project(), 'subject', subjectFrame), MAIN, ids));
    const gv = guidesOf(doc, MAIN).find((g) => g.id === 'gv');
    if (!gv) throw new Error('no guide');
    doc = withComposition(doc, 'gv', (c) => ({ ...c, placements: { ...c.placements, subject: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } } }));
    const fromVertical = layerSpots(doc, 'gv', 'subject', 'gv');
    expect(fromVertical[0]?.layout).toBe(MAIN);
    expect(fromVertical.map((s) => s.layout)).not.toContain('gv');
    expect(fromVertical[0]?.label).toBe('Square');
    expect(fromVertical[0]?.frame).toEqual(mainComposition(doc).placements.subject);
    const fromMaster = layerSpots(doc, MAIN, 'subject', MAIN);
    expect(fromMaster.find((s) => s.layout === 'gv')).toEqual({ layout: 'gv', label: 'Vertical', frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } });
    // From an output (nothing excluded): every layout that places it.
    expect(layerSpots(doc, MAIN, 'subject').map((s) => s.layout)[0]).toBe(MAIN);
    expect(layerSpots(doc, MAIN, 'nobody')).toEqual([]);
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

  it('an output moved to another group draws that group\'s picture (a square one in Horizontal: the horizontal picture)', () => {
    const doc = withVariants(project());
    const moved = (layout: 'square' | 'vertical' | 'horizontal', width: number, height: number) =>
      computeLayout({ ...doc, outputs: [output({ size: { width, height, unit: 'px' }, layout })] }, 'o1', { measure: mockMeasure, assets: {} }).items.find((i) => i.sourceId === 'background')?.assetId;
    expect(moved('horizontal', 2400, 2400)).toBe('wide');
    expect(moved('vertical', 2400, 2400)).toBe('tall');
    expect(moved('square', 1080, 1920)).toBeUndefined(); // the main (square) picture
  });

  it('an empty slot falls back to the main picture', () => {
    const doc = { ...withVariants(project()), sources: withVariants(project()).sources.map((s) => (s.id === 'background' && s.content.kind === 'image' ? { ...s, content: { ...s.content, variants: { vertical: 'tall' } } } : s)) };
    expect(bg(doc, 728, 90)?.assetId).toBeUndefined();
  });
});

describe('owner, 2026-11-03: a logo never stretches', () => {
  // The logo's square picture is 1:1; its horizontal one 4:1. Both measured, no transparent margin.
  const assets = { sq: { width: 400, height: 400, trim: { x: 0, y: 0, w: 1, h: 1 } }, wide: { width: 800, height: 200, trim: { x: 0, y: 0, w: 1, h: 1 } } };
  const withLogo = (variants: { horizontal?: string } = {}): ProjectDoc => {
    const doc = place(project(), 'logo', { x: 300, y: 300, w: 600, h: 600, fitted: true });
    return { ...doc, sources: doc.sources.map((s) => (s.id === 'logo' ? { ...s, kind: 'image', content: { kind: 'image', assetId: 'sq', focal: { x: 0.5, y: 0.5 }, variants } } : s)) };
  };
  const logo = (doc: ProjectDoc, width: number, height: number) =>
    computeLayout({ ...doc, outputs: [output({ size: { width, height, unit: 'px' } })] }, 'o1', { measure: mockMeasure, assets }).items.find((i) => i.sourceId === 'logo');

  it('a horizontal output drawing the horizontal logo gives it that picture’s shape, same centre and area', () => {
    const sq = logo(withLogo({ horizontal: 'wide' }), 1080, 1080);
    const it = logo(withLogo({ horizontal: 'wide' }), 1456, 180);
    expect(sq?.assetId).toBeUndefined();
    expect(it?.assetId).toBe('wide');
    const f = it?.frame;
    if (!f) throw new Error('no logo');
    expect(f.w / f.h).toBeCloseTo(4, 6);
    const plain = logo(withLogo(), 1456, 180)?.frame;
    if (!plain) throw new Error('no logo');
    expect(f.w * f.h).toBeCloseTo(plain.w * plain.h, 4);
    expect(f.x + f.w / 2).toBeCloseTo(plain.x + plain.w / 2, 4);
  });

  it('a stretched logo frame is drawn in its picture’s shape', () => {
    const doc = place(withLogo(), 'logo', { x: 300, y: 300, w: 900, h: 300, fitted: true });
    const f = logo(doc, 1080, 1080)?.frame;
    expect(f && f.w / f.h).toBeCloseTo(1, 6);
  });

  it('keepAspect keeps the centre and area; fillBoxes(keepShape) fits the picture inside, centred', () => {
    expect(keepAspect({ x: 0, y: 0, w: 400, h: 100 }, 1)).toEqual({ x: 100, y: -50, w: 200, h: 200 });
    const { img } = fillBoxes({ w: 400, h: 100 }, { width: 100, height: 100, trim: { x: 0, y: 0, w: 1, h: 1 } }, true);
    expect(img).toEqual({ x: 150, y: 0, w: 100, h: 100 });
  });
});

describe('owner, 2026-11-03 (D80): a layout shows the master\'s layers as its Previews do', () => {
  const ids = { vertical: 'gv', horizontal: 'gh' };
  it('a layer placed on the master after the layouts were made keeps its proportions in each layout', () => {
    let doc = ok(addGuides(project(), MAIN, ids));
    // Placed afterwards: the layouts have no placement of their own for it.
    doc = place(doc, 'subject', { x: 600, y: 2400, w: 1200, h: 300, fitted: true });
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.guide ? { ...c, placements: Object.fromEntries(Object.entries(c.placements).filter(([id]) => id !== 'subject')) } : c)) };
    for (const g of ['gv', 'gh']) {
      expect(guidesOf(doc, MAIN).find((c) => c.id === g)?.placements.subject).toBeUndefined();
      const it = masterScene(doc, g).items.find((i) => i.sourceId === 'subject');
      expect(it && it.frame.w / it.frame.h).toBeCloseTo(4, 3);
    }
  });

  it('each layout draws the logo set’s picture for its family; the master its square one', () => {
    let doc = ok(addGuides(place(project(), 'logo', { x: 100, y: 100, w: 400, h: 400 }), MAIN, ids));
    doc = { ...doc, sources: doc.sources.map((s) => (s.id === 'logo' ? { ...s, kind: 'image', content: { kind: 'image', assetId: 'sq', focal: { x: 0.5, y: 0.5 }, variants: { vertical: 'tall', horizontal: 'wide' } } } : s)) };
    const logoOf = (comp: string) => masterScene(doc, comp).items.find((i) => i.sourceId === 'logo');
    expect(logoOf(MAIN)?.assetId).toBeUndefined();
    expect(logoOf('gv')?.assetId).toBe('tall');
    expect(logoOf('gh')?.assetId).toBe('wide');
  });
});

describe('D82: a layer moved in a layout, or following Square', () => {
  it('a new layout sits every layer where Square puts it; a move marks it; Follow Square again undoes the move', () => {
    let doc = ok(addGuides(project(), MAIN, { vertical: 'gv', horizontal: 'gh' }));
    // Seeded from Square (D42): each layer starts where the stretched grid puts Square's, so none is moved.
    expect(['logo', 'subject', 'headline'].some((id) => movedInLayout(doc, 'gh', id))).toBe(false);
    doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === 'gh' ? { ...c, placements: { ...c.placements, logo: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } } } : c)) };
    expect(movedInLayout(doc, 'gh', 'logo')).toBe(true);
    expect(movedInLayout(doc, 'gv', 'logo')).toBe(false);
    doc = ok(followMaster(doc, 'gh', 'logo'));
    expect(movedInLayout(doc, 'gh', 'logo')).toBe(false);
    expect(guidesOf(doc, MAIN).find((c) => c.id === 'gh')?.placements.logo).toBeUndefined();
    expect(movedInLayout(doc, MAIN, 'logo')).toBe(false);
    expect(followMaster(doc, MAIN, 'logo').ok).toBe(false);
  });

  it('Square moved after the layout was made: the layout\u2019s seeded place no longer matches, so it reads as moved', () => {
    let doc = ok(addGuides(project(), MAIN, { vertical: 'gv', horizontal: 'gh' }));
    doc = place(doc, 'logo', { x: 2000, y: 2000, w: 300, h: 300 });
    expect(movedInLayout(doc, 'gh', 'logo')).toBe(true);
  });
});

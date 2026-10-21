import { describe, expect, it } from 'vitest';
import { MAIN, withComposition } from '../graph';
import type { ProjectDoc } from '../model';
import { fillsAxis, pinOf } from './grid';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const item = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);
const at = (width: number, height: number, patch: Parameters<typeof output>[0] = {}) => project(output({ size: { width, height, unit: 'px' }, ...patch }));
const subjectFrame = { x: 900, y: 750, w: 1200, h: 1800 };
const onlySubject = (doc: ProjectDoc): ProjectDoc => ({ ...doc, edges: doc.edges.filter((e) => e.from !== 'headline') });

describe('pins and fills', () => {
  it('pin by the centre: first third → start edge, middle third → centre, last third → end edge', () => {
    expect(pinOf(150, 400, 3000)).toBe('start');
    expect(pinOf(900, 1200, 3000)).toBe('centre');
    expect(pinOf(2450, 400, 3000)).toBe('end');
  });
  it('fills an axis when it reaches within 0.5% of both edges, or past them', () => {
    expect(fillsAxis(0, 3000, 3000)).toBe(true);
    expect(fillsAxis(15, 2970, 3000)).toBe(true);
    expect(fillsAxis(-300, 3600, 3000)).toBe(true);
    expect(fillsAxis(240, 2520, 3000)).toBe(false);
  });
});

describe('subject (v3 stretched grid, example A)', () => {
  it('1080×1350: scaled by k = 0.36, centre on the stretched grid', () => {
    const r = item(place(at(1080, 1350), 'subject', subjectFrame), 'subject');
    // centre (1500, 1650) of 3000² → (0.5·1080, 0.55·1350) = (540, 742.5); 432×648
    expectFrame(r?.frame, { x: 324, y: 418.5, w: 432, h: 648 });
    expect(r?.warnings).toEqual([]);
  });

  it('story 1080×1920 and banner 3000×1000: same look, the grid stretches', () => {
    expectFrame(item(place(at(1080, 1920), 'subject', subjectFrame), 'subject')?.frame, { x: 324, y: 732, w: 432, h: 648 });
    expectFrame(item(place(at(3000, 1000), 'subject', subjectFrame), 'subject')?.frame, { x: 1300, y: 250, w: 400, h: 600 });
  });

  it('other layers do not move it', () => {
    const doc = place(at(1080, 1350), 'subject', subjectFrame);
    expect(item(onlySubject(doc), 'subject')?.frame).toEqual(item(doc, 'subject')?.frame);
  });

  it('offsets by the bleed', () => {
    const doc = place(at(1080, 1350, { bleedMm: 25.4 }), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 324 + 96, y: 418.5 + 96, w: 432, h: 648 });
  });

  it('example J: a layer near the right edge keeps its right edge on the grid', () => {
    const near = { x: 2400, y: 1200, w: 500, h: 600 }; // right edge at 2900/3000; centre y at 0.5
    expectFrame(item(place(at(1080, 1350), 'subject', near), 'subject')?.frame, { x: 1044 - 180, y: 675 - 108, w: 180, h: 216 });
    expectFrame(item(place(at(1080, 1920), 'subject', near), 'subject')?.frame, { x: 1044 - 180, y: 960 - 108, w: 180, h: 216 });
  });

  it('example K: a layer filling the master covers the output; a full-width strip fills the width', () => {
    const full = { x: 0, y: 0, w: 3000, h: 3000 };
    expectFrame(item(place(at(1080, 1350), 'subject', full), 'subject')?.frame, { x: -135, y: 0, w: 1350, h: 1350 });
    expectFrame(item(place(at(3000, 1000), 'subject', full), 'subject')?.frame, { x: 0, y: -1000, w: 3000, h: 3000 });
    const strip = { x: 0, y: 2400, w: 3000, h: 600 }; // fills x; bottom edge pinned
    expectFrame(item(place(at(1080, 1920), 'subject', strip), 'subject')?.frame, { x: 0, y: 1704, w: 1080, h: 216 });
    expectFrame(item(place(at(3000, 1000), 'subject', strip), 'subject')?.frame, { x: 0, y: 400, w: 3000, h: 600 });
  });

  it('keeps master rotation and skew', () => {
    const r = item(place(at(1080, 1350), 'subject', { ...subjectFrame, rotation: 15, shear: 10 }), 'subject');
    expect(r?.frame).toMatchObject({ rotation: 15, shear: 10 });
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

  it('is placed like a subject', () => {
    expectFrame(item(withDecoration(place(at(1080, 1350), 'subject', subjectFrame)), 'subject')?.frame, { x: 324, y: 418.5, w: 432, h: 648 });
  });

  it('hanging off the master edge, it hangs off the output edge too', () => {
    const r = item(withDecoration(place(at(1080, 1350), 'subject', { x: -300, y: 0, w: 600, h: 600 })), 'subject');
    expectFrame(r?.frame, { x: -108, y: 0, w: 216, h: 216 });
    expect(r?.warnings).toEqual([]);
  });
});

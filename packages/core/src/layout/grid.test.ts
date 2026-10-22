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
/** The grid scale √(sx·sy) on 1080×1350 from 3000²: √(0.36·0.45). */
const G = Math.sqrt(0.36 * 0.45);
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
  it('1080×1350: scaled by the grid scale √(sx·sy), centre on the stretched grid', () => {
    const r = item(place(at(1080, 1350), 'subject', subjectFrame), 'subject');
    // centre (1500, 1650) of 3000² → (0.5·1080, 0.55·1350) = (540, 742.5); 1200G × 1800G (G ≈ 0.4025)
    expectFrame(r?.frame, { x: 540 - 600 * G, y: 742.5 - 900 * G, w: 1200 * G, h: 1800 * G });
    expect(r?.warnings).toEqual([]);
  });

  it('story 1080×1920 (√(0.36·0.64) = 0.48) and banner 3000×1000 (capped to the height: 0.5)', () => {
    expectFrame(item(place(at(1080, 1920), 'subject', subjectFrame), 'subject')?.frame, { x: 252, y: 624, w: 576, h: 864 });
    // √(1·⅓) ≈ 0.577 would be 1039 tall; centred at y 550 there is room for 2·450 = 900 → 0.5.
    expectFrame(item(place(at(3000, 1000), 'subject', subjectFrame), 'subject')?.frame, { x: 1200, y: 100, w: 600, h: 900 });
  });

  it('other layers do not move it', () => {
    const doc = place(at(1080, 1350), 'subject', subjectFrame);
    expect(item(onlySubject(doc), 'subject')?.frame).toEqual(item(doc, 'subject')?.frame);
  });

  it('offsets by the bleed', () => {
    const doc = place(at(1080, 1350, { bleedMm: 25.4 }), 'subject', subjectFrame);
    expectFrame(item(doc, 'subject')?.frame, { x: 540 - 600 * G + 96, y: 742.5 - 900 * G + 96, w: 1200 * G, h: 1800 * G });
  });

  it('example J: a layer near the right edge keeps its right edge on the grid', () => {
    const near = { x: 2400, y: 1200, w: 500, h: 600 }; // right edge at 2900/3000; centre y at 0.5
    expectFrame(item(place(at(1080, 1350), 'subject', near), 'subject')?.frame, { x: 1044 - 500 * G, y: 675 - 300 * G, w: 500 * G, h: 600 * G });
    expectFrame(item(place(at(1080, 1920), 'subject', near), 'subject')?.frame, { x: 804, y: 816, w: 240, h: 288 });
  });

  it('example K: a layer filling the master covers the output (proportional); a full-width strip stretches with the grid', () => {
    const full = { x: 0, y: 0, w: 3000, h: 3000 };
    expectFrame(item(place(at(1080, 1350), 'subject', full), 'subject')?.frame, { x: -135, y: 0, w: 1350, h: 1350 });
    expectFrame(item(place(at(3000, 1000), 'subject', full), 'subject')?.frame, { x: 0, y: -1000, w: 3000, h: 3000 });
    const strip = { x: 0, y: 2400, w: 3000, h: 600 }; // edge to edge across: x by sx, y by sy (the grid itself)
    expectFrame(item(place(at(1080, 1920), 'subject', strip), 'subject')?.frame, { x: 0, y: 1536, w: 1080, h: 384 });
    expectFrame(item(place(at(3000, 1000), 'subject', strip), 'subject')?.frame, { x: 0, y: 800, w: 3000, h: 200 });
    // A strip down one side stretches the other way.
    expectFrame(item(place(at(1080, 1920), 'subject', { x: 0, y: 0, w: 300, h: 3000 }), 'subject')?.frame, { x: 0, y: 0, w: 108, h: 1920 });
  });

  it('example L: never past the output edges — a wide layer is capped to the room around its pin', () => {
    // Story: 0.48 would make it 1209.6 wide; centred at x 540 there is room for 1080 → 1080/2520.
    expectFrame(item(place(at(1080, 1920), 'subject', { x: 240, y: 1000, w: 2520, h: 300 }), 'subject')?.frame, { x: 0, y: (1150 / 3000) * 1920 - 64.285714, w: 1080, h: 128.571429 });
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
    expectFrame(item(withDecoration(place(at(1080, 1350), 'subject', subjectFrame)), 'subject')?.frame, { x: 540 - 600 * G, y: 742.5 - 900 * G, w: 1200 * G, h: 1800 * G });
  });

  it('hanging off the master edge, it hangs off the output edge too', () => {
    const r = item(withDecoration(place(at(1080, 1350), 'subject', { x: -300, y: 0, w: 600, h: 600 })), 'subject');
    expectFrame(r?.frame, { x: -108, y: 0, w: 600 * G, h: 600 * G });
    expect(r?.warnings).toEqual([]);
  });
});

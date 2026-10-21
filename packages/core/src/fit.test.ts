import { describe, expect, it } from 'vitest';
import { effectiveTrim, fillBoxes, fitFrames, fittedFrame, layersOfPicture, pictureAspect, unfitPictures, visibleRect } from './fit';
import { mainComposition } from './graph';
import { computeLayout } from './layout';
import { mockMeasure, output, place, project } from './layout/test-doc';
import type { Frame, ProjectDoc } from './model';
import { addProcess, connectProcessInput } from './processes';
import { setOverrideFrame } from './overrides';
import { setPlacement } from './placement';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const close = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);
/** A 400×300 picture whose visible pixels are the middle half across, the top two-thirds down. */
const BADGE = { width: 400, height: 300, trim: { x: 0.25, y: 0, w: 0.5, h: 2 / 3 } };

/** Where a point of the picture (0..1) lands on the canvas, drawn the old way (contain in `f`, turned with it). */
function containPoint(f: Frame, size: { width: number; height: number }, u: number, v: number) {
  const s = Math.min(f.w / size.width, f.h / size.height);
  const [w, h] = [size.width * s, size.height * s];
  const lx = -w / 2 + u * w;
  const ly = -h / 2 + v * h;
  const r = ((f.rotation ?? 0) * Math.PI) / 180;
  const k = Math.tan(((f.shear ?? 0) * Math.PI) / 180);
  const x = lx + k * ly;
  return { x: f.x + f.w / 2 + Math.cos(r) * x - Math.sin(r) * ly, y: f.y + f.h / 2 + Math.sin(r) * x + Math.cos(r) * ly };
}
/** Where a point of a fitted frame (0..1 of it) lands on the canvas. */
function framePoint(f: Frame, u: number, v: number) {
  return containPoint(f, { width: f.w, height: f.h }, u, v);
}

describe('fittedFrame: the visible part of the picture, exactly where it was drawn', () => {
  it('square frame, wide picture with margins', () => {
    const f = fittedFrame({ x: 0, y: 0, w: 400, h: 400 }, BADGE);
    // contain: 400×300 centred → y 50..350; visible part x 100..300, y 50..250
    expect(f).toEqual({ x: 100, y: 50, w: 200, h: 200, fitted: true });
  });
  it('keeps the pixels in place under rotation and skew', () => {
    const before: Frame = { x: 120, y: 80, w: 500, h: 260, rotation: 33, shear: -12 };
    const f = fittedFrame(before, BADGE);
    expect(f).toMatchObject({ rotation: 33, shear: -12, fitted: true });
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const a = framePoint(f, u, v);
      const b = containPoint(before, BADGE, 0.25 + 0.5 * u, (2 / 3) * v);
      close(a.x, b.x);
      close(a.y, b.y);
    }
  });
  it('a picture without margins: the frame becomes the picture itself', () => {
    expect(fittedFrame({ x: 0, y: 0, w: 100, h: 100 }, { width: 200, height: 100, trim: { x: 0, y: 0, w: 1, h: 1 } })).toEqual({ x: 0, y: 25, w: 100, h: 50, fitted: true });
  });
});

describe('process effects (crop, mirror, quarter turn)', () => {
  it('the crop cuts the trim; the visible part is the overlap', () => {
    expect(visibleRect(BADGE.trim, { crop: { x: 0, y: 0, w: 0.5, h: 1 } })).toEqual({ x: 0.25, y: 0, w: 0.25, h: 2 / 3 });
    expect(visibleRect(BADGE.trim, { crop: { x: 0.8, y: 0.8, w: 0.2, h: 0.2 } })).toEqual({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 }); // no overlap: the crop
  });
  it('mirror then quarter turn, as the renderer draws them', () => {
    const t = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(effectiveTrim(t, { flipX: true, rotate: 0 })).toMatchObject({ x: 0.6, y: 0.2 });
    const near = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => (['x', 'y', 'w', 'h'] as const).forEach((k) => close(a[k], b[k]));
    near(effectiveTrim(t, { flipX: false, rotate: 90 }), { x: 0.4, y: 0.1, w: 0.4, h: 0.3 });
    const r180 = effectiveTrim(t, { flipX: false, rotate: 180 });
    close(r180.x, 0.6);
    close(r180.y, 0.4);
    near(effectiveTrim(t, { flipX: false, rotate: 270 }), { x: 0.2, y: 0.6, w: 0.4, h: 0.3 });
  });
  it('fillBoxes: the visible part fills the frame, stretched per axis', () => {
    const b = fillBoxes({ w: 300, h: 100 }, BADGE);
    // visible 200×200 px of the picture → 300×100: k = 1.5 across, 0.5 down
    expect(b.img).toEqual({ x: -0.25 * 400 * 1.5, y: 0, w: 600, h: 150 });
    expect(b.pane).toEqual({ x: 0, y: 0, w: 300, h: 100 });
    // A quarter turn swaps the pane's sides.
    expect(fillBoxes({ w: 300, h: 100 }, BADGE, { rotate: 90 }).pane).toEqual({ x: 100, y: -100, w: 100, h: 300 });
  });
});

describe('fitFrames / unfitPictures on a project', () => {
  const doc0 = () => {
    let d = place(project(output()), 'subject', { x: 900, y: 750, w: 1200, h: 1800 });
    d = { ...d, sources: d.sources.map((s) => (s.id === 'subject' && s.content.kind === 'image' ? { ...s, content: { ...s.content, assetId: 'badge' } } : s)) };
    return d;
  };
  const assets = { badge: BADGE };

  it('fits placements in place, once; backgrounds and unmeasured pictures are left alone', () => {
    const d = doc0();
    expect(fitFrames(d, { badge: { width: 400, height: 300 } })).toBe(d); // trim not measured yet
    const f = fitFrames(d, assets);
    const p = mainComposition(f).placements.subject;
    expect(p?.fitted).toBe(true);
    expect(fitFrames(f, assets)).toBe(f); // idempotent
    const { width: W } = mainComposition(f).size;
    // 1200×1800 frame, contain 400×300 → 1200×900; visible 600×600 at the frame's centre-top area
    close((p?.w ?? 0) * W, 600, 3);
  });

  it('outputs follow the fitted master frame (uniform scale), flagged too', () => {
    const f = fitFrames(doc0(), assets);
    const item = computeLayout(f, 'o1', { measure: mockMeasure, assets }).items.find((i) => i.sourceId === 'subject');
    expect(item?.frame.fitted).toBe(true);
    close((item?.frame.w ?? 0) / (item?.frame.h ?? 1), 1, 6); // the visible part is square
  });

  it('whole-frame overrides are fitted in place too', () => {
    const d = ok(setOverrideFrame(doc0(), 'o1', 'subject', { x: 10, y: 20, w: 400, h: 400 }, { by: 'u', at: '2026-10-21T00:00:00.000Z' }));
    const ov = fitFrames(d, assets).outputs[0]?.overrides[0];
    expect(ov?.frame).toMatchObject({ x: 110, y: 70, w: 200, h: 200, fitted: true });
  });

  it('moving or resizing keeps a frame fitted; replacing the picture unfits it (and its processes)', () => {
    let f = fitFrames(doc0(), assets);
    f = ok(setPlacement(f, 'subject', { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }));
    expect(mainComposition(f).placements.subject?.fitted).toBe(true);
    f = ok(addProcess(f, { id: 'p1', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 } }));
    f = ok(connectProcessInput(f, 'p1', 'subject'));
    expect([...layersOfPicture(f, 'subject')].sort()).toEqual(['p1', 'subject']);
    const un = unfitPictures(f, layersOfPicture(f, 'subject'));
    expect(mainComposition(un).placements.subject?.fitted).toBeUndefined();
    expect(unfitPictures(un, new Set(['subject']))).toBe(un);
  });
});

describe('editing fitted frames', () => {
  it('an output override written from a fitted frame stays fitted, so fitFrames leaves it alone', async () => {
    const { setOverrideFrame } = await import('./overrides');
    let d = place(project(output()), 'subject', { x: 900, y: 750, w: 1200, h: 1800 });
    d = { ...d, sources: d.sources.map((s) => (s.id === 'subject' && s.content.kind === 'image' ? { ...s, content: { ...s.content, assetId: 'badge' } } : s)) };
    d = ok(setOverrideFrame(d, 'o1', 'subject', { x: 1, y: 2, w: 300, h: 100, fitted: true }, { by: 'u', at: '2026-10-21T00:00:00.000Z' }));
    expect(d.outputs[0]?.overrides[0]?.frame).toMatchObject({ w: 300, h: 100, fitted: true });
    expect(fitFrames(d, { badge: BADGE }).outputs[0]?.overrides[0]).toBe(d.outputs[0]?.overrides[0]); // the master placement gets fitted; the override is left as is
  });
});

describe('pictureAspect: a fitted picture\'s own shape, whatever its frame was stretched to', () => {
  const layer = (effect?: { crop?: { x: number; y: number; w: number; h: number }; rotate?: 0 | 90 | 180 | 270 }) =>
    ({ id: 'p', label: 'p', kind: 'image', behavesLike: 'subject', visible: true, content: { kind: 'image', assetId: 'badge', focal: { x: 0.5, y: 0.5 } }, board: { x: 0, y: 0 }, ...(effect ? { effect: { flipX: false, rotate: 0, ...effect } } : {}) }) as Parameters<typeof pictureAspect>[0];
  it('the visible part in pixels: 200×200 of the 400×300 badge', () => close(pictureAspect(layer(), { badge: BADGE }) ?? 0, 1));
  it('after a crop and a quarter turn', () => {
    // crop the left half: visible 100×200 → 1:2; turned → 2:1
    close(pictureAspect(layer({ crop: { x: 0, y: 0, w: 0.5, h: 1 } }), { badge: BADGE }) ?? 0, 0.5);
    close(pictureAspect(layer({ crop: { x: 0, y: 0, w: 0.5, h: 1 }, rotate: 90 }), { badge: BADGE }) ?? 0, 2);
  });
  it('unknown until the trim is measured', () => expect(pictureAspect(layer(), { badge: { width: 400, height: 300 } })).toBeUndefined());
});

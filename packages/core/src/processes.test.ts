import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { mockMeasure, output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { connectOutputLayer } from './output-layers';
import { connectSource } from './ports';
import {
  addProcess,
  applyOp,
  connectProcessInput,
  deleteProcess,
  effectBoxes,
  effectFilter,
  layerAssetSize,
  layerSources,
  NO_EFFECT,
  resolveProcess,
  updateProcess,
} from './processes';
import { masterScene } from './render';

const ok = (r: { ok: true; doc: ProjectDoc } | { ok: false; error: string }): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const close = (a: { x: number; y: number; w: number; h: number } | undefined, b: { x: number; y: number; w: number; h: number }) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(a?.[k], k).toBeCloseTo(b[k], 9);
};

describe('effects fold a chain into one canonical crop → mirror → rotate (T12.5)', () => {
  it('flips and quarter turns compose', () => {
    expect(applyOp(NO_EFFECT, { type: 'flip', x: true, y: false })).toMatchObject({ flipX: true, rotate: 0 });
    expect(applyOp(NO_EFFECT, { type: 'flip', x: false, y: true })).toMatchObject({ flipX: true, rotate: 180 });
    expect(applyOp(NO_EFFECT, { type: 'flip', x: true, y: true })).toMatchObject({ flipX: false, rotate: 180 });
    const turned = applyOp(NO_EFFECT, { type: 'flip', x: false, y: false, rotate: 90 });
    expect(turned).toMatchObject({ flipX: false, rotate: 90 });
    // Mirror after a 90° turn = turn −90° after mirroring.
    expect(applyOp(turned, { type: 'flip', x: true, y: false })).toMatchObject({ flipX: true, rotate: 270 });
  });

  it('a crop after a turn or a mirror is mapped back to the image', () => {
    const left = { x: 0, y: 0, w: 0.5, h: 1 };
    close(applyOp(NO_EFFECT, { type: 'crop', rect: left }).crop, left);
    // Mirrored: the left half of the view is the right half of the image.
    close(applyOp(applyOp(NO_EFFECT, { type: 'flip', x: true, y: false }), { type: 'crop', rect: left }).crop, { x: 0.5, y: 0, w: 0.5, h: 1 });
    // Turned 90° clockwise: the view's left half is the image's bottom half.
    close(applyOp(applyOp(NO_EFFECT, { type: 'flip', x: false, y: false, rotate: 90 }), { type: 'crop', rect: left }).crop, { x: 0, y: 0.5, w: 1, h: 0.5 });
    // Crop of a crop.
    const twice = applyOp(applyOp(NO_EFFECT, { type: 'crop', rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }), { type: 'crop', rect: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    close(twice.crop, { x: 0.5, y: 0.5, w: 0.25, h: 0.25 });
  });

  it('adjustments multiply (blur adds) and become a CSS filter', () => {
    const a = applyOp(applyOp(NO_EFFECT, { type: 'adjust', brightness: 1.2, opacity: 0.5 }), { type: 'adjust', brightness: 1.5, blurPx: 2 });
    expect(a.brightness).toBeCloseTo(1.8);
    expect(a.opacity).toBe(0.5);
    expect(effectFilter(a)).toBe('brightness(1.8) blur(2px)');
    expect(effectFilter(NO_EFFECT)).toBeUndefined();
  });

  it('effect boxes: the cropped, turned picture fits the frame; the image is placed so its crop lands there', () => {
    // 400×200 image, right half cropped (200×200), turned 90°: contain in a 100×50 frame → a 50×50 view, centred.
    const e = { ...NO_EFFECT, crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, rotate: 90 as const };
    const b = effectBoxes({ w: 100, h: 50 }, { width: 400, height: 200 }, e, false);
    close(b.view, { x: 25, y: 0, w: 50, h: 50 });
    close(b.pane, { x: 0, y: 0, w: 50, h: 50 });
    close(b.img, { x: -50, y: 0, w: 100, h: 50 });
    const subject = project().sources[1];
    if (!subject) throw new Error('no subject');
    expect(layerAssetSize({ ...subject, content: { kind: 'image', assetId: 'a', focal: { x: 0.5, y: 0.5 } }, effect: { ...e, crop: { x: 0, y: 0, w: 0.5, h: 0.25 } } }, { a: { width: 400, height: 200 } })).toEqual({ width: 50, height: 200 });
  });
});

describe('process nodes on the graph', () => {
  const withCrop = () => {
    let doc = ok(addProcess(project(), { id: 'p1', op: { type: 'crop', rect: { x: 0, y: 0, w: 0.5, h: 1 } }, board: { x: 0, y: 0 }, input: 'subject' }));
    doc = { ...doc, edges: doc.edges.filter((e) => !(e.from === 'subject' && e.to === 'main')) };
    return ok(connectSource(doc, 'p1'));
  };

  it('a process stands for its effective layer: the input, its behaviour and content, with the chain applied', () => {
    const doc = withCrop();
    const p = resolveProcess(doc, 'p1');
    expect(p).toMatchObject({ id: 'p1', label: 'Crop', behavesLike: 'subject', kind: 'image', effect: { crop: { x: 0, y: 0, w: 0.5, h: 1 } } });
    const chained = ok(addProcess(doc, { id: 'p2', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 }, input: 'p1' }));
    expect(resolveProcess(chained, 'p2')?.effect).toMatchObject({ crop: { x: 0, y: 0, w: 0.5, h: 1 }, flipX: true });
    expect(layerSources(chained).map((s) => s.id)).toEqual([...doc.sources.map((s) => s.id), 'p1', 'p2']);
    // Unwired: not a layer.
    expect(resolveProcess(ok(addProcess(doc, { id: 'p3', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 } })), 'p3')).toBeUndefined();
  });

  it('wired into a row it gets its behaviour’s default placement; the layout and the main preview draw it', () => {
    const doc = withCrop();
    expect(doc.compositions[0]?.layers[0]).toBe('p1');
    expect(doc.compositions[0]?.placements['p1']).toEqual({ x: 0.2, y: 0.12, w: 0.6, h: 0.6 });
    expect(masterScene(doc).items.some((i) => i.sourceId === 'p1')).toBe(true);
    const items = computeLayout({ ...doc, outputs: [output()] }, 'o1', { measure: mockMeasure, assets: {} }).items;
    expect(items.some((i) => i.sourceId === 'p1')).toBe(true);
    expect(items.some((i) => i.sourceId === 'subject')).toBe(false);
    // Also as an output-only layer.
    const own = ok(connectOutputLayer({ ...doc, compositions: doc.compositions.map((c) => ({ ...c, layers: c.layers.filter((l) => l !== 'p1') })), edges: doc.edges.filter((e) => e.to !== 'main' || e.from !== 'p1') }, 'o1', 'p1'));
    expect(computeLayout(own, 'o1', { measure: mockMeasure, assets: {} }).items.at(-1)?.sourceId).toBe('p1');
  });

  it('one wire into a process (re-wiring replaces it), no loops; edits keep the op type; delete cleans up', () => {
    let doc = ok(addProcess(withCrop(), { id: 'p2', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 }, input: 'p1' }));
    expect(connectProcessInput(doc, 'p1', 'p2').ok).toBe(false); // p2 is downstream of p1
    doc = ok(connectProcessInput(doc, 'p2', 'logo'));
    expect(doc.edges.filter((e) => e.to === 'p2').map((e) => e.from)).toEqual(['logo']);
    expect(updateProcess(doc, 'p1', { op: { type: 'adjust' } }).ok).toBe(false);
    doc = ok(updateProcess(doc, 'p1', { op: { type: 'crop', rect: { x: 0.25, y: 0, w: 0.5, h: 1 } }, label: 'Left' }));
    expect(resolveProcess(doc, 'p1')).toMatchObject({ label: 'Left', effect: { crop: { x: 0.25 } } });
    const gone = ok(deleteProcess(doc, 'p1'));
    expect(gone.processes.map((p) => p.id)).toEqual(['p2']);
    expect(gone.compositions[0]?.layers.includes('p1')).toBe(false);
    expect(gone.compositions[0]?.placements['p1']).toBeUndefined();
    expect(gone.edges.some((e) => e.from === 'p1' || e.to === 'p1')).toBe(false);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  classifyEdgeDrag, corners, decompose, det, dragRotate, dragScale, dragSkew, edgeLean, HANDLE_UV, linear, pointAt,
  applyOp, derive, docFromState, keepPoint, pushOp, resetForHandle, restoreAspect, rotateOp, scaleOp, skewOp, toCssMatrix,
  type TransformDoc, type TransformOp, type TransformState, type Vec,
} from './math';

const base: TransformState = { x: 200, y: 150, width: 100, height: 60, scaleX: 1, scaleY: 1, rotation: 0, shear: 0 };
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const closeV = (p: Vec, q: Vec, eps = 1e-6) => {
  close(p.x, q.x, eps);
  close(p.y, q.y, eps);
};
const sameShape = (s: TransformState, t: TransformState) => {
  const [a, b] = [corners(s), corners(t)];
  a.forEach((p, i) => closeV(p, b[i] as Vec, 1e-6));
};
/** Unit direction of the segment p→q. */
const dir = (p: Vec, q: Vec) => {
  const l = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
};

describe('matrix', () => {
  it('identity puts the centre at (x, y)', () => {
    assert.equal(toCssMatrix(base), 'matrix(1, 0, 0, 1, 150, 120)');
  });
  it('rotation pivots on the centre', () => {
    const s = { ...base, rotation: 90 };
    closeV(pointAt(s, { x: 0, y: 0 }), { x: 200, y: 150 });
    closeV(pointAt(s, HANDLE_UV.e), { x: 200, y: 200 });
  });
  it('decompose is the inverse of R·H·S (flips kept where they were)', () => {
    for (const s of [
      { ...base, rotation: 33, shear: 20, scaleX: 1.4, scaleY: 0.7 },
      { ...base, rotation: -120, shear: -40, scaleX: -0.8, scaleY: 1.2 },
      { ...base, rotation: 170, shear: 5, scaleX: 2, scaleY: -1 },
    ]) {
      const d = decompose(linear(s), s);
      close(d.rotation, s.rotation);
      close(d.shear, s.shear);
      close(d.scaleX, s.scaleX);
      close(d.scaleY, s.scaleY);
    }
  });
});

describe('scale', () => {
  it('corner, opposite pivot: dragging se by (+50, +30) gives 1.5× and keeps nw fixed', () => {
    const p0 = pointAt(base, HANDLE_UV.se);
    const s = dragScale(base, 'se', p0, { x: p0.x + 50, y: p0.y + 30 }, { pivot: 'opposite', free: false });
    close(s.scaleX, 1.5);
    close(s.scaleY, 1.5);
    closeV(pointAt(s, HANDLE_UV.nw), pointAt(base, HANDLE_UV.nw));
  });
  it('corner, centre pivot: centre stays, both sides grow', () => {
    const p0 = pointAt(base, HANDLE_UV.se);
    const s = dragScale(base, 'se', p0, { x: p0.x + 50, y: p0.y + 30 }, { pivot: 'center', free: false });
    close(s.scaleX, 2);
    close(s.x, 200);
  });
  it('edge stretch on a rotated box moves only along its normal, opposite edge fixed', () => {
    const r = { ...base, rotation: 90 };
    const p0 = pointAt(r, HANDLE_UV.e);
    const s = dragScale(r, 'e', p0, { x: p0.x + 40, y: p0.y + 50 }, { pivot: 'opposite', free: false });
    close(s.scaleX, 1.5);
    closeV(pointAt(s, HANDLE_UV.w), pointAt(r, HANDLE_UV.w));
  });
  it('dragging past the opposite edge flips, never 0', () => {
    const p0 = pointAt(base, HANDLE_UV.e);
    close(dragScale(base, 'e', p0, { x: p0.x - 150, y: p0.y }, { pivot: 'opposite', free: false }).scaleX, -0.5);
    assert.ok(dragScale(base, 'e', p0, { x: p0.x - 100, y: p0.y }, { pivot: 'opposite', free: false }).scaleX !== 0);
  });
  it('stretching a sheared box keeps the shear and the edge directions', () => {
    const k = { ...base, shear: 20, rotation: 10 };
    const p0 = pointAt(k, HANDLE_UV.e);
    const s = dragScale(k, 'e', p0, { x: p0.x + 50, y: p0.y }, { pivot: 'opposite', free: false });
    close(s.shear, 20);
    close(s.rotation, 10);
  });
});

describe('skew (Affinity: the dragged edge slides along itself, the opposite edge stays put)', () => {
  it('right edge dragged down 50: left edge fixed, right edge moved straight down, sides still vertical', () => {
    const p0 = pointAt(base, HANDLE_UV.e);
    const s = dragSkew(base, 'e', p0, { x: p0.x, y: p0.y + 50 });
    closeV(pointAt(s, HANDLE_UV.nw), pointAt(base, HANDLE_UV.nw));
    closeV(pointAt(s, HANDLE_UV.sw), pointAt(base, HANDLE_UV.sw));
    closeV(pointAt(s, HANDLE_UV.ne), { x: 250, y: 170 });
    closeV(pointAt(s, HANDLE_UV.se), { x: 250, y: 230 });
    // In the R·H·S model that is a rotation of the top edge plus a shear, as Affinity shows it.
    close(s.rotation, Math.atan2(50, 100) * (180 / Math.PI));
    close(s.shear, s.rotation); // CSS skewX sign: the sides lean back by the same angle the top turned
    close(det(linear(s)), det(linear(base))); // shear keeps the area
  });
  it('sideways movement is ignored: only the part along the edge counts', () => {
    const p0 = pointAt(base, HANDLE_UV.e);
    sameShape(dragSkew(base, 'e', p0, { x: p0.x + 30, y: p0.y + 50 }), dragSkew(base, 'e', p0, { x: p0.x, y: p0.y + 50 }));
  });
  it('top edge dragged right 30: bottom fixed, top slides right, shear −26.6°, rotation 0', () => {
    const p0 = pointAt(base, HANDLE_UV.n);
    const s = dragSkew(base, 'n', p0, { x: p0.x + 30, y: p0.y });
    closeV(pointAt(s, HANDLE_UV.sw), pointAt(base, HANDLE_UV.sw));
    closeV(pointAt(s, HANDLE_UV.nw), { x: 180, y: 120 });
    close(s.rotation, 0);
    close(s.shear, -Math.atan2(30, 60) * (180 / Math.PI));
  });
  it('a second skew on the other pair of edges slides that edge along its own (slanted) direction', () => {
    const a0 = pointAt(base, HANDLE_UV.e);
    const one = dragSkew(base, 'e', a0, { x: a0.x, y: a0.y + 40 }); // top/bottom now slanted
    const topDir = dir(pointAt(one, HANDLE_UV.nw), pointAt(one, HANDLE_UV.ne));
    const b0 = pointAt(one, HANDLE_UV.n);
    const two = dragSkew(one, 'n', b0, { x: b0.x + 25 * topDir.x, y: b0.y + 25 * topDir.y });
    closeV(pointAt(two, HANDLE_UV.sw), pointAt(one, HANDLE_UV.sw)); // bottom edge fixed
    closeV(pointAt(two, HANDLE_UV.se), pointAt(one, HANDLE_UV.se));
    closeV(dir(pointAt(two, HANDLE_UV.nw), pointAt(two, HANDLE_UV.ne)), topDir); // top edge kept its direction…
    closeV(pointAt(two, HANDLE_UV.n), { x: b0.x + 25 * topDir.x, y: b0.y + 25 * topDir.y }); // …and slid along it
    close(det(linear(two)), det(linear(base)));
  });
  it('works the same on a rotated box', () => {
    const r = { ...base, rotation: 90 };
    const p0 = pointAt(r, HANDLE_UV.e); // the right edge now runs horizontally
    const s = dragSkew(r, 'e', p0, { x: p0.x - 50, y: p0.y });
    closeV(pointAt(s, HANDLE_UV.w), pointAt(r, HANDLE_UV.w));
    closeV(pointAt(s, HANDLE_UV.e), { x: p0.x - 50, y: p0.y });
  });
  it('Alt: about the centre — the centre stays, the opposite edge moves the other way', () => {
    const p0 = pointAt(base, HANDLE_UV.e);
    const s = dragSkew(base, 'e', p0, { x: p0.x, y: p0.y + 50 }, 'center');
    close(s.x, 200);
    close(s.y, 150);
    closeV(pointAt(s, HANDLE_UV.w), { x: 150, y: 100 });
  });
  it('never flattens the box', () => {
    const p0 = pointAt(base, HANDLE_UV.e);
    const s = dragSkew(base, 'e', p0, { x: p0.x, y: p0.y + 5000 });
    assert.ok(edgeLean(linear(s)) <= 75 + 1e-6);
    closeV(pointAt(s, HANDLE_UV.w), pointAt(base, HANDLE_UV.w)); // still anchored
  });
});

describe('rotate', () => {
  it('a quarter turn around the centre adds 90°', () => close(dragRotate(base, { x: 200, y: 50 }, { x: 300, y: 150 }).rotation, 90));
  it('snaps', () => assert.equal(dragRotate(base, { x: 200, y: 50 }, { x: 300, y: 140 }, 15).rotation, 90));
});

describe('direction rule (touch, and the mouse by default)', () => {
  it('right edge: right = stretch, up/down = skew, tiny moves undecided', () => {
    assert.equal(classifyEdgeDrag(base, 'e', { x: 20, y: 3 }), 'stretch');
    assert.equal(classifyEdgeDrag(base, 'e', { x: 2, y: -20 }), 'skew');
    assert.equal(classifyEdgeDrag(base, 'e', { x: 3, y: 2 }), null);
  });
  it('follows the rotation', () => {
    const r = { ...base, rotation: 90 };
    assert.equal(classifyEdgeDrag(r, 'e', { x: 0, y: 20 }), 'stretch');
    assert.equal(classifyEdgeDrag(r, 'e', { x: 20, y: 0 }), 'skew');
  });
  it('follows a slanted edge', () => {
    const k = { ...base, shear: 40 }; // left/right edges lean
    const along = { x: 20 * Math.sin((40 * Math.PI) / 180), y: 20 * Math.cos((40 * Math.PI) / 180) };
    assert.equal(classifyEdgeDrag(k, 'e', along), 'skew');
  });
});

// ---------------------------------------------------------------- history + resets

/** A user session: each drag is computed from the current state and pointer, then recorded. */
type Drag = { h: 'e' | 'w' | 'n' | 's' | 'se' | 'nw' | 'ne' | 'rotate' | 'body'; d: Vec; kind?: 'skew'; center?: boolean };
function session(doc: TransformDoc, drags: Drag[]): TransformDoc {
  for (const g of drags) {
    const s = derive(doc);
    const h = g.h;
    const p0 = h === 'rotate' || h === 'body' ? { x: s.x + 80, y: s.y } : pointAt(s, HANDLE_UV[h]);
    const p = { x: p0.x + g.d.x, y: p0.y + g.d.y };
    const pivot = g.center ? ('center' as const) : ('opposite' as const);
    let op: TransformOp;
    if (h === 'body') op = { type: 'move', dx: g.d.x, dy: g.d.y };
    else if (h === 'rotate') op = rotateOp(s, p0, p);
    else if (g.kind === 'skew') op = skewOp(s, h as 'e' | 'w' | 'n' | 's', p0, p, pivot);
    else op = scaleOp(s, h, p0, p, { pivot, free: false });
    doc = pushOp(doc, op);
  }
  return doc;
}
const original = docFromState({ ...base });
const MIX: Drag[] = [
  { h: 'e', d: { x: 60, y: 0 } },                // stretch right
  { h: 'n', d: { x: 30, y: 0 }, kind: 'skew' },  // skew top
  { h: 'se', d: { x: 40, y: 35 } },              // scale corner
  { h: 'rotate', d: { x: 10, y: 70 } },          // rotate
  { h: 'w', d: { x: 0, y: 45 }, kind: 'skew' },  // skew left
  { h: 's', d: { x: 0, y: 30 } },                // stretch bottom
  { h: 'body', d: { x: 25, y: -15 } },           // move
];

describe('history', () => {
  it('replaying the history gives exactly what the drags showed', () => {
    let doc = original;
    let shown = derive(doc);
    for (const g of MIX) {
      const next = session(doc, [g]);
      const op = next.ops[next.ops.length - 1] as TransformOp;
      shown = applyOp(shown, op); // what the drag displayed
      doc = next;
      sameShape(derive(doc), shown);
    }
  });
  it('a state with no history converts to one that rebuilds it', () => {
    const s = { ...base, rotation: 33, shear: 20, scaleX: -1.4, scaleY: 0.7 };
    sameShape(derive(docFromState(s)), s);
  });
});

describe('resets: as if those drags never happened, in any combination', () => {
  const after = session(original, MIX);
  it('rotate handle = the same recorded drags, minus the rotations', () =>
    sameShape(derive(resetForHandle(after, 'rotate')), derive({ ...after, ops: after.ops.filter((o) => o.type !== 'rotate') })));
  it('left/right edge = the same drags minus its skews and its horizontal stretch', () => {
    const expect = { ...after, ops: after.ops.filter((o) => !(o.type === 'shear' && o.axis === 'lr')).map((o) => (o.type === 'scale' ? { ...o, kx: 1 } : o)) };
    sameShape(derive(resetForHandle(after, 'e')), derive(expect));
  });
  it('every reset, in any order, ends on the original pixels (plus the move)', () => {
    const moved = { ...base, x: base.x + 25, y: base.y - 15 };
    for (const order of [['se', 'e', 'n', 'rotate'], ['rotate', 'n', 'se', 'e'], ['e', 'rotate', 'se', 'n'], ['n', 'e', 'rotate', 'se']] as const) {
      let doc = after;
      for (const h of order) doc = resetForHandle(doc, h);
      sameShape(derive(doc), moved);
    }
  });
  it('double-clicking the element resets everything but the move', () =>
    sameShape(derive(resetForHandle(after, 'body')), { ...base, x: base.x + 25, y: base.y - 15 }));
  it('a corner reset removes only scale: rotation and skews are replayed in place', () => {
    const r = derive(resetForHandle(after, 'se'));
    const expect = derive(resetForHandle(resetForHandle(resetForHandle(after, 'se'), 'e'), 'n'));
    // Removing the skews afterwards leaves a pure rotation about the original centre (+ move): the corner
    // reset didn't shift anything the skews/rotation depended on.
    close(expect.scaleX, 1);
    close(expect.shear, 0);
    assert.ok(Math.abs(r.scaleX) > 0);
  });
  it('single drag, then its reset → original pixels (each handle, both pivots)', () => {
    for (const g of [
      { h: 'e', d: { x: 70, y: 5 } }, { h: 'w', d: { x: -50, y: 0 } }, { h: 'se', d: { x: 40, y: 50 } }, { h: 'nw', d: { x: -30, y: -20 } },
      { h: 'e', d: { x: 0, y: 50 }, kind: 'skew' }, { h: 'n', d: { x: 35, y: 0 }, kind: 'skew' }, { h: 'e', d: { x: 50, y: 0 }, center: true },
      { h: 's', d: { x: 0, y: 40 }, kind: 'skew', center: true }, { h: 'rotate', d: { x: 0, y: 60 } },
    ] as Drag[]) {
      sameShape(derive(resetForHandle(session(original, [g]), g.h)), base);
    }
  });
  it('scale with one corner, reset with another → original pixels', () => sameShape(derive(resetForHandle(session(original, [{ h: 'se', d: { x: 40, y: 50 } }]), 'nw')), base));
  it('drags on one edge merge into one operation', () => {
    const d = session(original, [{ h: 'e', d: { x: 20, y: 0 } }, { h: 'e', d: { x: 30, y: 0 } }]);
    assert.equal(d.ops.length, 1);
  });
  it('keepPoint keeps the given point', () => {
    const next = { ...base, scaleX: 3 };
    closeV(pointAt(keepPoint(base, next, { x: -1, y: 1 }), { x: -1, y: 1 }), pointAt(base, { x: -1, y: 1 }));
  });
});

describe('a picture resets to its own shape (restoreAspect)', () => {
  const ratio = (s: TransformState) => (s.width * s.scaleX) / (s.height * s.scaleY);
  // Rotated, then stretched before the editor opened: the history starts from the stretched frame.
  const loaded = docFromState({ ...base, width: 180, height: 60, rotation: 30 }); // the picture is 100×60 (5:3)
  const aspect = 100 / 60;

  it('without it, an edge reset has nothing to undo: the stretch stays', () => close(ratio(derive(resetForHandle(loaded, 'e'))), 3));
  it('left/right edge: the width comes back from the height; rotation and centre stay', () => {
    const s = derive(restoreAspect(resetForHandle(loaded, 'e'), 'e', aspect));
    close(ratio(s), aspect);
    close(s.height * s.scaleY, 60);
    close(s.rotation, 30);
    closeV({ x: s.x, y: s.y }, { x: base.x, y: base.y });
  });
  it('top/bottom edge: the height from the width; a corner: both, keeping the area', () => {
    const n = derive(restoreAspect(resetForHandle(loaded, 'n'), 'n', aspect));
    close(ratio(n), aspect);
    close(n.width * n.scaleX, 180);
    const c = derive(restoreAspect(resetForHandle(loaded, 'se'), 'se', aspect));
    close(ratio(c), aspect);
    close(c.width * c.scaleX * c.height * c.scaleY, 180 * 60);
  });
  it('rotated in this session, then stretched: the edge reset is exact, with nothing left to fix', () => {
    const rotated = pushOp(docFromState({ ...base }), { type: 'rotate', deg: 40 });
    const stretched = pushOp(rotated, { type: 'scale', kx: 1.8, ky: 1, pivot: { x: -1, y: 0 } });
    const reset = resetForHandle(stretched, 'e');
    sameShape(derive(reset), derive(rotated));
    assert.equal(restoreAspect(reset, 'e', aspect), reset);
  });
  it('a skew made in this session never triggers it (the box it started from has the picture\'s shape)', () => {
    const skewed = pushOp(pushOp(docFromState({ ...base }), { type: 'shear', axis: 'lr', k: 0.4, pivot: { x: -1, y: 0 } }), { type: 'scale', kx: 1.3, ky: 1.3, pivot: { x: -1, y: -1 } });
    const reset = resetForHandle(skewed, 'se');
    assert.equal(restoreAspect(reset, 'se', aspect), reset);
  });
  it('rotate, skew and move handles are left alone', () => {
    for (const h of ['rotate', 'body'] as const) assert.equal(restoreAspect(loaded, h, aspect), loaded);
    assert.equal(restoreAspect(loaded, 'e', undefined), loaded);
  });
});

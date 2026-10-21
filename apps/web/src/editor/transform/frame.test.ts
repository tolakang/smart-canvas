import { describe, expect, it } from 'vitest';
import { frameOfState, sameFrame, snapMove, snapTargets, stateOfFrame, syncDoc } from './frame';
import { derive, pushOp, resetForHandle, scaleOp, skewOp, pointAt, HANDLE_UV } from './math';

const f = { x: 100, y: 50, w: 200, h: 80, rotation: 30, shear: -12 };

describe('frames ↔ transform box', () => {
  it('round-trips a frame through the box state', () => {
    expect(sameFrame(frameOfState(stateOfFrame(f)), f, 1e-9)).toBe(true);
    expect(frameOfState(stateOfFrame({ x: 0, y: 0, w: 10, h: 10 }))).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
  it('rotation is stored 0..360, like the model', () => {
    expect(frameOfState({ ...stateOfFrame(f), rotation: -90 }).rotation).toBe(270);
  });
});

describe('syncDoc: the stored frame is the truth', () => {
  const doc = syncDoc(undefined, f);
  it('keeps the history while the frame matches (rounded storage included)', () => {
    const s = derive(doc);
    const p0 = pointAt(s, HANDLE_UV.e);
    const edited = pushOp(doc, scaleOp(s, 'e', p0, { x: p0.x + 40, y: p0.y }, { pivot: 'opposite', free: false, flip: false }));
    const stored = frameOfState(derive(edited));
    const rounded = { ...stored, x: Math.round(stored.x * 1000) / 1000, w: Math.round(stored.w * 1000) / 1000 };
    expect(syncDoc(edited, rounded)).toBe(edited);
  });
  it('a pure move from outside (arrow nudge) is recorded, so resets still land in place', () => {
    const s = derive(doc);
    const p0 = pointAt(s, HANDLE_UV.n);
    const skewed = pushOp(doc, skewOp(s, 'n', p0, { x: p0.x + 30, y: p0.y }));
    const now = frameOfState(derive(skewed));
    const nudged = syncDoc(skewed, { ...now, x: now.x + 10 });
    expect(nudged.ops.at(-1)).toMatchObject({ type: 'move', dx: 10 });
    const back = frameOfState(derive(resetForHandle(resetForHandle(nudged, 'n'), 'rotate')));
    expect(sameFrame(back, { x: f.x + 10, y: f.y, w: f.w, h: f.h }, 1e-6)).toBe(true);
  });
  it('any other outside change (typed size, undo) starts a new history from the frame', () => {
    const typed = syncDoc(doc, { ...f, w: 300 });
    expect(sameFrame(frameOfState(derive(typed)), { ...f, w: 300 }, 1e-9)).toBe(true);
  });
});

describe('move snapping', () => {
  const targets = snapTargets({ width: 1000, height: 600 }, [{ x: 600, y: 300, w: 100, h: 100 }]);
  it('snaps the nearest edge or centre within the tolerance, per axis', () => {
    const moved = stateOfFrame({ x: 3, y: 150, w: 100, h: 90 }); // left edge 3 px from the canvas edge
    expect(snapMove(moved, targets, 6)).toEqual({ dx: -3, dy: 0, x: [0], y: [] });
    const near = stateOfFrame({ x: 400, y: 296, w: 100, h: 50 }); // top 4 px above the other layer's top
    expect(snapMove(near, targets, 6)).toMatchObject({ dy: 4, y: [300] });
  });
  it('uses the drawn bounds of a rotated / skewed box', () => {
    const turned = { ...stateOfFrame({ x: 100, y: 100, w: 100, h: 100 }), rotation: 45 };
    const r = snapMove(turned, { x: [150 - 50 * Math.SQRT2], y: [] }, 1);
    expect(r?.dx).toBeCloseTo(0, 6);
  });
  it('nothing within reach → no snap', () => expect(snapMove(stateOfFrame({ x: 200, y: 150, w: 10, h: 10 }), targets, 2)).toBeNull());
});

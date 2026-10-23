import { describe, expect, it } from 'vitest';
import { fitScale, nudge, toBox, toNFrame } from './geometry';

const canvas = { width: 3000, height: 2000 };

describe('editor geometry', () => {
  it('converts placements to screen boxes and back without drift', () => {
    const f = { x: 0.1, y: 0.25, w: 0.5, h: 0.3, rotation: 15 };
    const box = toBox(f, canvas, 0.2);
    expect(box).toEqual({ x: 60, y: 100, w: 300, h: 120, rotation: 15 });
    const back = toNFrame(box, canvas, 0.2);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(back[k]).toBeCloseTo(f[k], 12);
    expect(back.rotation).toBe(15);
    expect(toNFrame({ ...box, rotation: 0 }, canvas, 0.2)).not.toHaveProperty('rotation');
  });

  it('nudges by design px', () => {
    const n = nudge({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, 10, -1, canvas);
    expect(n.x * canvas.width).toBeCloseTo(1510, 9);
    expect(n.y * canvas.height).toBeCloseTo(999, 9);
  });

  it('fits the canvas into the area', () => {
    expect(fitScale(canvas, { width: 1064, height: 1064 })).toBeCloseTo(1000 / 3000, 9);
    expect(fitScale(canvas, { width: 3064, height: 564 })).toBeCloseTo(500 / 2000, 9);
  });
});

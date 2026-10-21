import { describe, expect, it } from 'vitest';
import { trimOfPixels } from './trim';

/** A w×h RGBA image with the given pixels opaque. */
function pixels(w: number, h: number, opaque: [number, number][], alpha = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of opaque) d[(y * w + x) * 4 + 3] = alpha;
  return d;
}

describe('trimOfPixels (D37)', () => {
  it('the box of the visible pixels, rounded outwards', () => {
    expect(trimOfPixels(pixels(10, 4, [[2, 1], [5, 2]]), 10, 4)).toEqual({ x: 0.2, y: 0.25, w: 0.4, h: 0.5 });
  });
  it('faint alpha (a shadow tail) does not count', () => {
    expect(trimOfPixels(pixels(4, 4, [[0, 0]], 5), 4, 4)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(trimOfPixels(pixels(4, 4, [[1, 1]], 9), 4, 4)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
  });
  it('fully transparent or fully opaque → the whole picture', () => {
    expect(trimOfPixels(pixels(3, 3, []), 3, 3)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const all: [number, number][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) all.push([x, y]);
    expect(trimOfPixels(pixels(3, 3, all), 3, 3)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

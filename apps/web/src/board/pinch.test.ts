import { describe, expect, it } from 'vitest';
import { pinchViewport } from './pinch';

const limits = { min: 0.1, max: 2 };

describe('pinchViewport (D58)', () => {
  it('fingers spread to twice the distance → twice the zoom, the board point under the midpoint stays put', () => {
    const start = { x: 100, y: 50, zoom: 0.5 };
    const v = pinchViewport(start, { mid: { x: 200, y: 150 }, dist: 100 }, { mid: { x: 200, y: 150 }, dist: 200 }, limits);
    expect(v.zoom).toBe(1);
    // Board point under (200, 150) at the start: ((200 - 100) / 0.5, (150 - 50) / 0.5) = (200, 200).
    expect({ x: (200 - v.x) / v.zoom, y: (150 - v.y) / v.zoom }).toEqual({ x: 200, y: 200 });
  });

  it('fingers moving together pan the board by the same amount', () => {
    const start = { x: 10, y: 20, zoom: 1 };
    expect(pinchViewport(start, { mid: { x: 100, y: 100 }, dist: 80 }, { mid: { x: 130, y: 60 }, dist: 80 }, limits)).toEqual({ x: 40, y: -20, zoom: 1 });
  });

  it('zoom stays within the board limits', () => {
    const start = { x: 0, y: 0, zoom: 1.5 };
    expect(pinchViewport(start, { mid: { x: 0, y: 0 }, dist: 50 }, { mid: { x: 0, y: 0 }, dist: 500 }, limits).zoom).toBe(2);
    expect(pinchViewport(start, { mid: { x: 0, y: 0 }, dist: 500 }, { mid: { x: 0, y: 0 }, dist: 1 }, limits).zoom).toBe(0.1);
  });
});

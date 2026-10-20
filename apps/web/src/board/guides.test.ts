import { describe, expect, it } from 'vitest';
import { align } from './guides';

describe('alignment guides (T13.5)', () => {
  const other = { x: 100, y: 100, w: 200, h: 100 }; // left 100, centre 200, right 300; top 100, middle 150, bottom 200

  it('snaps left edges, centres and right edges within the threshold', () => {
    expect(align({ x: 104, y: 400, w: 80, h: 40 }, [other])).toEqual({ x: 100, vertical: 100 }); // left ↔ left
    expect(align({ x: 158, y: 400, w: 80, h: 40 }, [other])).toEqual({ x: 160, vertical: 200 }); // centre 198 ↔ 200
    expect(align({ x: 225, y: 400, w: 80, h: 40 }, [other])).toEqual({ x: 220, vertical: 300 }); // right 305 ↔ 300
  });

  it('snaps on both axes independently; nothing beyond the threshold', () => {
    expect(align({ x: 302, y: 197, w: 50, h: 50 }, [other])).toEqual({ x: 300, vertical: 300, y: 200, horizontal: 200 });
    expect(align({ x: 500, y: 500, w: 50, h: 50 }, [other])).toEqual({});
  });

  it('picks the nearest match among several nodes', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 7, y: 300, w: 100, h: 100 };
    expect(align({ x: 6, y: 600, w: 40, h: 40 }, [a, b]).x).toBe(7);
  });
});

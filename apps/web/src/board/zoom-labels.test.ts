import { describe, expect, it } from 'vitest';
import { visibleTags } from './ZoomLabels';

describe('zoomed-out name tags (D69)', () => {
  const tag = (id: string, x: number, y: number, w = 100) => ({ id, x, y, w, h: 26 });

  it('a tag that would cover one already kept is left out; tags clear of each other all show', () => {
    // At 25 % a 100 px tag spans 400 board px: b starts 300 px right of a, so it would cover a's tag.
    expect([...visibleTags([tag('a', 0, 1000), tag('b', 300, 1000), tag('c', 1000, 1000)], 0.25)]).toEqual(['a', 'c']);
    // Closer in (100 %) the same panels have room for every tag.
    expect([...visibleTags([tag('a', 0, 1000), tag('b', 300, 1000), tag('c', 1000, 1000)], 1)]).toEqual(['a', 'b', 'c']);
  });

  it('tags of panels far apart vertically never clash', () => {
    expect(visibleTags([tag('a', 0, 0), tag('b', 0, 2000)], 0.2).size).toBe(2);
  });
});

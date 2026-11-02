import { describe, expect, it } from 'vitest';
import { MIN_TAG, visibleTags } from './ZoomLabels';

describe('zoomed-out name tags (D69, K5)', () => {
  const tag = (id: string, x: number, y: number, w = 100, panelW?: number) => ({ id, x, y, w, h: 26, ...(panelW ? { panelW } : {}) });

  it('a tag that would cover one already kept is left out; tags clear of each other all show', () => {
    // At 25 % a 100 px tag spans 400 board px: b starts 300 px right of a, so it would cover a's tag.
    expect([...visibleTags([tag('a', 0, 1000), tag('b', 300, 1000), tag('c', 1000, 1000)], 0.25).keys()]).toEqual(['a', 'c']);
    // Closer in (100 %) the same panels have room for every tag.
    expect([...visibleTags([tag('a', 0, 1000), tag('b', 300, 1000), tag('c', 1000, 1000)], 1).keys()]).toEqual(['a', 'b', 'c']);
  });

  it('K5: a tag wider than its panel is cut to the panel, so side-by-side panels all keep a name', () => {
    // 280 px panels at 25 % are 70 px on screen: each tag is cut to 70 px and fits above its own panel.
    const shown = visibleTags([tag('a', 0, 1000, 100, 280), tag('b', 300, 1000, 100, 280), tag('c', 1000, 1000, 100, 280)], 0.25);
    expect([...shown.entries()]).toEqual([
      ['a', 70],
      ['b', 70],
      ['c', 70],
    ]);
    // A tag narrower than its panel keeps its own width.
    expect(visibleTags([tag('a', 0, 0, 60, 800)], 0.5).get('a')).toBe(60);
  });

  it('K5: a cut tag is never narrower than MIN_TAG; one that still overlaps is left out', () => {
    // At 10 % a 280 px panel is 28 px on screen: the tag stays MIN_TAG wide (480 board px) and b's would cover it.
    const shown = visibleTags([tag('a', 0, 1000, 100, 280), tag('b', 300, 1000, 100, 280)], 0.1);
    expect([...shown.entries()]).toEqual([['a', MIN_TAG]]);
  });

  it('tags of panels far apart vertically never clash', () => {
    expect(visibleTags([tag('a', 0, 0), tag('b', 0, 2000)], 0.2).size).toBe(2);
  });
});

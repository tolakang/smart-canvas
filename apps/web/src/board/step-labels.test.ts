import { describe, expect, it } from 'vitest';
import { labelFits, stepLabels, stepOf } from './StepLabels';

const n = (id: string, x: number, y: number, hidden = false) => ({ id, position: { x, y }, hidden });

describe('UX C2 (A): the board names its three steps', () => {
  it('each panel belongs to its step; Previews and group frames to none', () => {
    expect(stepOf('stk:logo')).toBe('assets');
    expect(stepOf('hl:h')).toBe('assets');
    expect(stepOf('src:background')).toBe('assets');
    expect(stepOf('main')).toBe('main');
    expect(stepOf('set:gdn')).toBe('sizes');
    expect(stepOf('out:a')).toBeNull();
    expect(stepOf('grp:g')).toBeNull();
  });

  it('a label at the top of each row, all ending at the board’s left edge, top first', () => {
    const nodes = [n('stk:logo', 100, 0), n('hl:h', 420, -20), n('main', 300, 600), n('set:gdn', 200, 1200), n('out:a', 40, 1250), n('set:fb', 200, 1800)];
    expect(stepLabels(nodes, 1)).toEqual([
      { step: 'assets', x: 40, y: -20 },
      { step: 'main', x: 40, y: 600 },
      { step: 'sizes', x: 40, y: 1200 },
    ]);
  });

  it('a row with no panel has no label; hidden panels and group frames count for nothing', () => {
    expect(stepLabels([n('stk:logo', 0, 0), n('set:gdn', 0, 900, true), n('grp:g', -500, -500)], 1)).toEqual([{ step: 'assets', x: 0, y: 0 }]);
    expect(stepLabels([], 1)).toEqual([]);
  });

  it('zoomed far out, a label that would touch the one above it on screen is left out', () => {
    const nodes = [n('stk:logo', 0, 0), n('main', 0, 400), n('set:gdn', 0, 1000)];
    expect(stepLabels(nodes, 0.05).map((l) => l.step)).toEqual(['assets', 'sizes']);
    expect(stepLabels(nodes, 0.5).map((l) => l.step)).toEqual(['assets', 'main', 'sizes']);
  });

  it('a label shows only when it fits on screen to the left of the board (a phone opens at its edge)', () => {
    // "Assets": 6 × 7.5 + 16 gap = 61 px, so its row must start at least 65 px in from the canvas's left.
    expect(labelFits('assets', 0, 1, 65)).toBe(true);
    expect(labelFits('assets', 0, 1, 40)).toBe(false);
    expect(labelFits('assets', 200, 0.5, -30)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { carryFrame, forEachOutput } from './edit-all';
import { output, project } from './layout/test-doc';
import { setOverrideHidden } from './overrides';

describe('D84: an edit in one size carried to the others, in proportion', () => {
  const from = { width: 1000, height: 200 };
  const to = { width: 300, height: 600 };
  const target = { x: 100, y: 200, w: 60, h: 40 };

  it('a move of 10 % of the canvas across is 10 % of each canvas', () => {
    const before = { x: 400, y: 50, w: 200, h: 100 };
    const after = { ...before, x: 500, y: 70 };
    expect(carryFrame(before, after, from, to, target)).toEqual({ x: 130, y: 260, w: 60, h: 40 });
  });

  it('a resize by a factor resizes each by it, about its own centre; a turn adds to each', () => {
    const before = { x: 400, y: 50, w: 200, h: 100 };
    const after = { x: 350, y: 25, w: 300, h: 150, rotation: 10 };
    // The centre doesn't move; ×1.5 both ways; +10°.
    expect(carryFrame(before, after, from, to, { ...target, rotation: 5, fitted: true })).toEqual({ x: 85, y: 190, w: 90, h: 60, rotation: 15, fitted: true });
  });

  it('forEachOutput applies one edit to every size as one result', () => {
    let doc = project(output({ id: 'a' }));
    doc = { ...doc, outputs: [...doc.outputs, output({ id: 'b' })] };
    const r = forEachOutput(doc, ['a', 'b'], (d, id) => setOverrideHidden(d, id, 'logo', true, { by: 'Ada', at: '2026-11-03T00:00:00Z' }));
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.outputs.every((o) => o.overrides.some((x) => x.sourceId === 'logo' && x.hidden))).toBe(true);
  });
});

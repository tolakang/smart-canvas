import { describe, expect, it } from 'vitest';
import type { ProjectDoc } from '../model';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const logo = (doc: ProjectDoc) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === 'logo');
const topLeft = { x: 150, y: 150, w: 400, h: 200 };
const wide = output({ size: { width: 3000, height: 1000, unit: 'px' } });

describe('logo (example D, v3)', () => {
  it('1080×1350: 144×72, its top-left corner on the stretched grid', () => {
    const r = logo(place(project(), 'logo', topLeft));
    expectFrame(r?.frame, { x: 54, y: 67.5, w: 144, h: 72 }); // (150·0.36, 150·0.45)
    expect(r?.warnings).toEqual([]);
  });

  it('3000×1000: 133.33×66.67 at (150, 50)', () => {
    expectFrame(logo(place(project(wide), 'logo', topLeft))?.frame, { x: 150, y: 50, w: 400 / 3, h: 200 / 3 });
  });
});

describe('logo', () => {
  it('keeps the edges nearest the master edges on the grid', () => {
    expectFrame(logo(place(project(), 'logo', { x: 2450, y: 150, w: 400, h: 200 }))?.frame, { x: 1026 - 144, y: 67.5, w: 144, h: 72 });
    expectFrame(logo(place(project(), 'logo', { x: 150, y: 2650, w: 400, h: 200 }))?.frame, { x: 54, y: 1282.5 - 72, w: 144, h: 72 });
    expectFrame(logo(place(project(), 'logo', { x: 2450, y: 2650, w: 400, h: 200 }))?.frame, { x: 1026 - 144, y: 1282.5 - 72, w: 144, h: 72 });
  });

  it('enforces the minimum width (8% of the short trim edge), keeping aspect and its pin', () => {
    const r = logo(place(project(), 'logo', { x: 150, y: 150, w: 100, h: 50 })); // 36×18 < 86.4
    expectFrame(r?.frame, { x: 54, y: 67.5, w: 86.4, h: 43.2 });
    expect(r?.warnings).toEqual(['min-logo']);
    // Bottom-right: grows towards the inside.
    expectFrame(logo(place(project(), 'logo', { x: 2800, y: 2850, w: 100, h: 50 }))?.frame, { x: 1044 - 86.4, y: 1305 - 43.2, w: 86.4, h: 43.2 });
  });

  it('respects bleed and keeps rotation', () => {
    const r = logo(place(project(output({ bleedMm: 25.4 })), 'logo', { ...topLeft, rotation: 10 }));
    expectFrame(r?.frame, { x: 96 + 54, y: 96 + 67.5, w: 144, h: 72 });
    expect(r?.frame.rotation).toBe(10);
  });
});

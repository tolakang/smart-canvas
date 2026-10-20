import { describe, expect, it } from 'vitest';
import { mainComposition } from './graph';
import type { ProjectDoc } from './model';
import { defaultPlacement, ensurePlacement, setPlacement } from './placement';
import { connectSource } from './ports';
import { createProjectDoc } from './project';
import { masterScene } from './render';

const ok = (r: { ok: true; doc: ProjectDoc } | { ok: false }) => {
  if (!r.ok) throw new Error('op failed');
  return r.doc;
};

describe('placements', () => {
  it('first wire auto-places by behaviour (Flow 3); re-wiring keeps a moved placement', () => {
    let doc = ok(connectSource(createProjectDoc('P'), 'logo'));
    expect(mainComposition(doc).placements.logo).toEqual(defaultPlacement('logo'));
    doc = ok(setPlacement(doc, 'logo', { x: 0.1, y: 0.1, w: 0.2, h: 0.1 }));
    doc = ok(connectSource(doc, 'logo', 3));
    expect(mainComposition(doc).placements.logo).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
  });

  it('every behaviour has a default inside the canvas', () => {
    for (const b of ['background', 'subject', 'text', 'logo', 'decoration'] as const) {
      const f = defaultPlacement(b);
      expect(f.x >= 0 && f.y >= 0 && f.x + f.w <= 1 && f.y + f.h <= 1).toBe(true);
    }
  });

  it('setPlacement rounds, normalizes rotation to 0..360 and drops zero rotation', () => {
    const doc = ok(setPlacement(createProjectDoc('P'), 'subject', { x: 0.1234567891, y: 0.2, w: 0.3, h: 0.4, rotation: -30 }));
    expect(mainComposition(doc).placements.subject).toEqual({ x: 0.123457, y: 0.2, w: 0.3, h: 0.4, rotation: 330 });
    const flat = ok(setPlacement(doc, 'subject', { x: 0, y: 0, w: 1, h: 1, rotation: 360 }));
    expect(mainComposition(flat).placements.subject).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(setPlacement(doc, 'nope', { x: 0, y: 0, w: 1, h: 1 })).toEqual({ ok: false, error: 'not_found' });
  });

  it('ensurePlacement leaves existing placements alone; wired + placed inputs show in the master scene', () => {
    const doc = ensurePlacement(ok(setPlacement(createProjectDoc('P'), 'headline', { x: 0, y: 0, w: 0.5, h: 0.1 })), 'headline');
    expect(mainComposition(doc).placements.headline).toEqual({ x: 0, y: 0, w: 0.5, h: 0.1 });
    let wired = createProjectDoc('P');
    for (const id of ['background', 'subject', 'headline', 'logo']) wired = ok(connectSource(wired, id));
    expect(masterScene(wired).items.map((i) => i.sourceId)).toEqual(['background', 'subject', 'headline', 'logo']);
  });
});

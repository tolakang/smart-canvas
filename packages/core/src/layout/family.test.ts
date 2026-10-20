import { describe, expect, it } from 'vitest';
import type { Override, ProjectDoc, TextStyle } from '../model';
import { addSource } from '../sources';
import { connectSource } from '../ports';
import { computeLayout, type LayoutDeps } from './index';
import { expectFrame, mockMeasure, output, place, project } from './test-doc';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const E = 'AAAAA BBBBB CCCCC DDDDD EEEEE';
const wide = (patch: Parameters<typeof output>[0] = {}) => output({ size: { width: 3000, height: 1000, unit: 'px' }, ...patch });

function setText(doc: ProjectDoc, id: string, text: string, patch: Partial<TextStyle> = {}): ProjectDoc {
  return {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === id && s.content.kind === 'text' ? { ...s, content: { ...s.content, text, style: { ...s.content.style, ...patch } } } : s,
    ),
  };
}

/** Adds a wired text source `id`. */
function addText(doc: ProjectDoc, id: string): ProjectDoc {
  const a = addSource(doc, { id, label: id, kind: 'text', behavesLike: 'text' });
  if (!a.ok) throw new Error(a.error);
  const c = connectSource(a.doc, id);
  if (!c.ok) throw new Error(c.error);
  return c.doc;
}

const at = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);

describe('families', () => {
  it('auto: side at ratio ≥ 1.3, stack below; explicit family wins', () => {
    expect(computeLayout(project(wide()), 'o1', deps).family).toBe('side');
    expect(computeLayout(project(output({ size: { width: 1080, height: 1080, unit: 'px' } })), 'o1', deps).family).toBe('stack');
    expect(computeLayout(project(wide({ family: 'stack' })), 'o1', deps).family).toBe('stack');
    expect(computeLayout(project(output({ family: 'side' })), 'o1', deps).family).toBe('side');
  });

  it('subject fills the right half in side; in stack the subject + headline group is centred in S', () => {
    const frame = { x: 900, y: 750, w: 1200, h: 1800 };
    expect(at(place(project(wide()), 'subject', frame), 'subject')?.frame.x).toBeCloseTo(1925);
    // stack: c = 900/2010 → 537.31 wide, centred on x = 1500
    expect(at(place(project(wide({ family: 'stack' })), 'subject', frame), 'subject')?.frame.x).toBeCloseTo(1231.343284);
  });
});

describe('side column', () => {
  it('puts one text in the left half of S, vertically centred, sized by its group (v2)', () => {
    // S = {50, 50, 2900, 900}; column 1450 wide; c = min(1450/2400, 900/500) = 0.6042 → f0 = 120.83, bh = 302.08;
    // 120.5 on the grid: 2 lines of ≤ 24 chars, 2·120.5·1.2 = 289.2 ≤ 302.08
    const doc = setText(place(project(wide()), 'headline', { x: 300, y: 300, w: 2400, h: 500 }), 'headline', E, { fontSizePx: 200 });
    const r = at(doc, 'headline');
    expect(r?.fontSizePx).toBe(120.5);
    expect(r?.lines).toEqual(['AAAAA BBBBB CCCCC DDDDD', 'EEEEE']);
    expectFrame(r?.frame, { x: 50, y: 50 + (900 - 289.2) / 2, w: 1450, h: 289.2 });
    expect(r?.warnings).toEqual([]);
  });

  it('stacks texts in master top→bottom order with a 2%·Ht gap', () => {
    let doc = addText(project(wide()), 'small');
    doc = place(doc, 'headline', { x: 300, y: 300, w: 2400, h: 500 });
    doc = place(doc, 'small', { x: 0, y: 100, w: 3000, h: 150 }); // above the headline on the master
    doc = setText(setText(doc, 'headline', 'HEAD', { fontSizePx: 300 }), 'small', 'TINY', { fontSizePx: 90 });
    const head = at(doc, 'headline');
    const small = at(doc, 'small');
    // texts' group U = {0,100,3000,700} → c = 1450/3000
    expect(head?.fontSizePx).toBe(145); // f0 = 300·c, one line of 174 ≤ bh 241.67
    expect(small?.fontSizePx).toBe(43.5); // f0 = 90·c, one line of 52.2 ≤ bh 72.5
    const hh = (head?.fontSizePx ?? 0) * 1.2;
    const sh = (small?.fontSizePx ?? 0) * 1.2;
    const block = hh + sh + 20;
    expectFrame(small?.frame, { x: 50, y: 50 + (900 - block) / 2, w: 1450, h: sh });
    expectFrame(head?.frame, { x: 50, y: 50 + (900 - block) / 2 + sh + 20, w: 1450, h: hh });
  });

  it('scales every size by S.h/blockHeight when the block is too tall, and warns clamped', () => {
    let doc = project(wide());
    const ids = ['headline', 't2', 't3', 't4'];
    for (const id of ids.slice(1)) doc = addText(doc, id);
    ids.forEach((id, i) => {
      doc = place(doc, id, { x: 0, y: i * 700, w: 3000, h: 2400 });
      doc = setText(doc, id, 'AB', { fontSizePx: 900, maxLines: 1 }); // f0 = 300 each → block 4·360 + 60 = 1500 > 900
    });
    const items = ids.map((id) => at(doc, id));
    const factor = (900 - 60) / (1500 - 60); // gaps stay 2%·Ht
    for (const r of items) {
      expect(r?.fontSizePx).toBe(Math.floor((300 * factor) / 0.5) * 0.5);
      expect(r?.warnings).toEqual(['clamped']);
    }
    const last = items[3]?.frame;
    expect((last?.y ?? 0) + (last?.h ?? 0)).toBeLessThanOrEqual(950 + 1e-6);
    expect(items[0]?.frame.y).toBeGreaterThanOrEqual(50);
  });

  it('a text with an override frame leaves the column and fits inside its frame', () => {
    const ov: Override = { sourceId: 'headline', frame: { x: 2000, y: 100, w: 500, h: 200 }, updatedBy: 'u', updatedAt: '2026-01-01T00:00:00Z' };
    const doc = setText(place(project(wide({ overrides: [ov] })), 'headline', { x: 300, y: 300, w: 2400, h: 500 }), 'headline', 'AB', { fontSizePx: 200 });
    const r = at(doc, 'headline');
    expectFrame(r?.frame, { x: 2000, y: 100, w: 500, h: 200 });
    expect(r?.overridden).toBe(true);
  });
});

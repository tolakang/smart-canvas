/**
 * T5.4 — override-safe re-flow (D20): on a full 10 inputs × 10 outputs project, no master or input edit
 * changes a stored override, and every overridden field still wins in every output's computed layout,
 * while non-overridden layers keep re-flowing.
 */
import { describe, expect, it } from 'vitest';
import { computeLayout, type LayoutDeps } from './layout';
import { mockMeasure } from './layout/test-doc';
import { LIMITS, type ProjectDoc } from './model';
import { addOutput, updateOutput } from './outputs';
import { setOverrideFrame, setOverrideHidden, setOverrideStyle } from './overrides';
import { setPlacement } from './placement';
import { connectSource, disconnectSource, moveSourceToPort } from './ports';
import { createProjectDoc } from './project';
import { addSource, deleteSource, duplicateSource, renameSource, setSourceVisible, type SourceResult } from './sources';
import { setTextStyle } from './text-style';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const deps: LayoutDeps = { measure: mockMeasure, assets: { photo: { width: 4000, height: 3000 } } };
const ada = { by: 'u1', at: '2026-10-20T00:00:00.000Z' };
const SIZES = [
  [1080, 1350, 'px'], [1080, 1080, 'px'], [1080, 1920, 'px'], [1200, 630, 'px'], [1500, 500, 'px'],
  [210, 297, 'mm'], [297, 210, 'mm'], [148, 210, 'mm'], [85, 55, 'mm'], [2560, 1440, 'px'],
] as const;

/** 10 inputs (4 defaults + 6 more), all wired; 10 outputs; every output overrides 3 layers. */
function bigProject(): ProjectDoc {
  let doc = createProjectDoc('Big');
  const extra = [
    ['t2', 'text', 'text'], ['t3', 'text', 'text'], ['d1', 'fill', 'decoration'],
    ['d2', 'image', 'decoration'], ['l2', 'vector', 'logo'], ['s2', 'image', 'subject'],
  ] as const;
  for (const [id, kind, behavesLike] of extra) doc = ok(addSource(doc, { id, label: id, kind, behavesLike }));
  expect(doc.sources).toHaveLength(LIMITS.maxSources);
  for (const s of doc.sources) doc = ok(connectSource(doc, s.id));
  doc = {
    ...doc,
    sources: doc.sources.map((s) =>
      s.content.kind === 'text'
        ? { ...s, content: { ...s.content, text: `${s.label} AAAAA BBBBB CCCCC` } }
        : s.id === 'background'
          ? { ...s, kind: 'image', content: { kind: 'image', assetId: 'photo', focal: { x: 0.6, y: 0.4 } } }
          : s,
    ),
  };
  SIZES.forEach(([width, height, unit], i) => {
    doc = ok(addOutput(doc, { id: `o${i}`, label: `Out ${i}`, size: { width, height, unit } }));
    doc = ok(setOverrideFrame(doc, `o${i}`, 'subject', { x: 10 + i, y: 20 + i }, ada));
    doc = ok(setOverrideStyle(doc, `o${i}`, 'headline', { fontSizePx: 30 + i, color: '#ff0000' }, ada));
    doc = ok(setOverrideHidden(doc, `o${i}`, i % 2 ? 'logo' : 'd1', true, ada));
  });
  expect(doc.outputs).toHaveLength(LIMITS.maxOutputs);
  return doc;
}

/** Master and input edits a user can make (none deletes a source that has overrides: that removes them by design). */
const masterEdits: [string, (d: ProjectDoc) => ProjectDoc][] = [
  ['move subject', (d) => ok(setPlacement(d, 'subject', { x: 0.05, y: 0.3, w: 0.5, h: 0.5, rotation: 12 }))],
  ['resize headline box', (d) => ok(setPlacement(d, 'headline', { x: 0.1, y: 0.1, w: 0.5, h: 0.3 }))],
  ['restyle headline', (d) => ok(setTextStyle(d, 'headline', { fontSizePx: 300, color: '#00ff00', maxLines: 1 }))],
  ['edit text', (d) => ({ ...d, sources: d.sources.map((s) => (s.id === 't2' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'New copy' } } : s)) })],
  ['change focal point', (d) => ({ ...d, sources: d.sources.map((s) => (s.id === 'background' && s.content.kind === 'image' ? { ...s, content: { ...s.content, focal: { x: 0.1, y: 0.9 } } } : s)) })],
  ['re-order', (d) => ok(moveSourceToPort(d, 'subject', 0))],
  ['rename', (d) => ok(renameSource(d, 'subject', 'Hero'))],
  ['hide + show', (d) => ok(setSourceVisible(ok(setSourceVisible(d, 't3', false)), 't3', true))],
  ['disconnect + reconnect input', (d) => ok(connectSource(ok(disconnectSource(d, 'l2')), 'l2'))],
  ['delete an input without overrides, duplicate another', (d) => ok(duplicateSource(ok(deleteSource(d, 's2')), 't3', 't4'))],
  ['master size', (d) => ({ ...d, master: { ...d.master, size: { width: 4000, height: 2500, unit: 'px' } } })],
  ['output size change', (d) => ok(updateOutput(d, 'o0', { size: { width: 1080, height: 1920, unit: 'px' } }))],
];

describe('override-safe re-flow (10 inputs × 10 outputs)', () => {
  it('master and input edits never change a stored override', () => {
    let doc = bigProject();
    const before = doc.outputs.map((o) => o.overrides);
    for (const [, edit] of masterEdits) {
      doc = edit(doc);
      expect(doc.outputs.map((o) => o.overrides), 'overrides after edits').toEqual(before);
    }
  });

  it('overridden fields still win in every output; other layers re-flow', () => {
    const start = bigProject();
    let doc = start;
    for (const [, edit] of masterEdits) doc = edit(doc);
    for (const o of doc.outputs) {
      const i = Number(o.id.slice(1));
      const items = computeLayout(doc, o.id, deps).items;
      const byId = new Map(items.map((it) => [it.sourceId, it]));
      expect(byId.get('subject')?.frame).toMatchObject({ x: 10 + i, y: 20 + i });
      expect(byId.get('subject')?.overridden).toBe(true);
      expect(byId.get('headline')?.fontSizePx).toBe(30 + i);
      expect(byId.has(i % 2 ? 'logo' : 'd1')).toBe(false);
      // a layer without an override followed the master (t2's text changed → its lines changed)
      const before = computeLayout(start, o.id, deps).items.find((it) => it.sourceId === 't2');
      expect(byId.get('t2')?.lines).not.toEqual(before?.lines);
      expect(byId.get('t2')?.overridden).toBe(false);
    }
  });

  it('lays out all 10 × 10 quickly', () => {
    const doc = bigProject();
    const t0 = Date.now();
    for (let n = 0; n < 5; n++) for (const o of doc.outputs) computeLayout(doc, o.id, deps);
    expect((Date.now() - t0) / 5).toBeLessThan(250); // one full pass over 10 outputs
  });
});

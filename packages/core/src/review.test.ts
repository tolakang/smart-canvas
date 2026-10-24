import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { mockMeasure, output, place, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { previewFingerprint } from './review';

const deps = { measure: mockMeasure, assets: {} };
const wired = (doc: ProjectDoc): ProjectDoc => ({ ...doc, edges: [...doc.edges, { id: 'out:o1', from: 'main', to: 'o1', kind: 'composition' }] });
const print = (doc: ProjectDoc) => previewFingerprint(doc, 'o1', computeLayout(doc, 'o1', deps));

describe('previewFingerprint (D63)', () => {
  const base = wired(place(project(), 'subject', { x: 300, y: 300, w: 1200, h: 1200 }));

  it('is the same for the same Preview, and survives float noise', () => {
    const fp = print(base);
    expect(fp).toMatch(/^[0-9a-f]{14}$/);
    expect(print(JSON.parse(JSON.stringify(base)) as ProjectDoc)).toBe(fp);
    expect(print(place(base, 'subject', { x: 300.0004, y: 300, w: 1200, h: 1200 }))).toBe(fp);
    // Board positions and names don't change what is drawn.
    expect(print({ ...base, name: 'Other', outputs: base.outputs.map((o) => ({ ...o, label: 'X', board: { x: 9, y: 9 } })) })).toBe(fp);
  });

  it('changes when a layer moves, its content or visibility changes, or the size or bleed changes', () => {
    const fp = print(base);
    expect(print(place(base, 'subject', { x: 400, y: 300, w: 1200, h: 1200 }))).not.toBe(fp);
    const recolored = { ...base, sources: base.sources.map((s) => (s.id === 'background' ? { ...s, content: { kind: 'fill' as const, fill: { type: 'solid' as const, color: '#123456' } } } : s)) };
    expect(print(recolored)).not.toBe(fp);
    expect(print({ ...base, sources: base.sources.map((s) => (s.id === 'subject' ? { ...s, visible: false } : s)) })).not.toBe(fp);
    expect(print({ ...base, outputs: [output({ size: { width: 1080, height: 1080, unit: 'px' } })] })).not.toBe(fp);
    expect(print({ ...base, outputs: [output({ bleedMm: 3 })] })).not.toBe(fp);
  });

  it('is empty for an output that does not exist', () => {
    expect(previewFingerprint(base, 'nope', computeLayout(base, 'o1', deps))).toBe('');
  });
});

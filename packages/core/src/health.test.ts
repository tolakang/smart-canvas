import { describe, expect, it } from 'vitest';
import { compositionHealth, isEmptyLayer, outputHealth } from './health';
import { computeLayout } from './layout';
import { mockMeasure, output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { disconnectOutput } from './outputs';

const deps = { measure: mockMeasure, assets: { photo: { width: 400, height: 300 }, mark: { width: 100, height: 50 } } };

/** Defaults wired, with a photo, a logo file and some text: nothing empty. */
function filled(doc: ProjectDoc): ProjectDoc {
  return {
    ...doc,
    sources: doc.sources.map((s) => {
      if (s.content.kind === 'image') return { ...s, content: { ...s.content, assetId: 'photo' } };
      if (s.content.kind === 'vector') return { ...s, content: { ...s.content, assetId: 'mark' } };
      if (s.content.kind === 'text') return { ...s, content: { ...s.content, text: 'AAAAA BBBBB' } };
      return s;
    }),
  };
}
const withOutputEdge = (doc: ProjectDoc): ProjectDoc => ({ ...doc, edges: [...doc.edges, { id: 'out:o1', from: 'main', to: 'o1', kind: 'composition' }] });

describe('layout health (D35)', () => {
  it('ok when everything fits and is filled', () => {
    const doc = withOutputEdge(filled(project()));
    expect(compositionHealth(doc)).toEqual({ level: 'ok', issues: [] });
    expect(outputHealth(doc, 'o1', computeLayout(doc, 'o1', deps)).level).toBe('ok');
  });

  it('lists wired layers with no file or text yet as a grey to-do, not a warning (D64)', () => {
    const doc = withOutputEdge(project()); // defaults: no photo, no logo file, no text
    const h = compositionHealth(doc);
    expect(h.level).toBe('empty');
    expect(h.issues.every((i) => i.level === 'todo')).toBe(true);
    expect(h.issues.map((i) => [i.sourceId, i.code])).toEqual([
      ['logo', 'empty'],
      ['headline', 'empty'],
      ['subject', 'empty'],
    ]);
    expect(h.issues[0]?.message).toBe('No file or text yet');
  });

  it('turns engine warnings into issues per layer (overflowing text)', () => {
    let doc = withOutputEdge(filled(project(output({ size: { width: 1080, height: 1080, unit: 'px' } }))));
    // A headline far too long for its box.
    doc = { ...doc, sources: doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'W'.repeat(400), style: { ...s.content.style, maxLines: 1 } } } : s)) };
    const layout = computeLayout(doc, 'o1', deps);
    const h = outputHealth(doc, 'o1', layout);
    expect(h.level).toBe('warning');
    expect(h.issues.map((i) => i.code)).toContain('text-overflow');
    expect(h.issues.find((i) => i.code === 'text-overflow')?.label).toBe('Headline');
  });

  it('a real warning outranks empty layers', () => {
    let doc = withOutputEdge(project(output({ size: { width: 1080, height: 1080, unit: 'px' } })));
    doc = { ...doc, sources: doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'W'.repeat(400), style: { ...s.content.style, maxLines: 1 } } } : s)) };
    const h = outputHealth(doc, 'o1', computeLayout(doc, 'o1', deps));
    expect(h.level).toBe('warning');
    expect(h.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['text-overflow', 'empty']));
  });

  it('a missing font is an error, on the output and on the composition', () => {
    const doc = withOutputEdge(filled(project()));
    expect(compositionHealth(doc, 'main', ['Noto Sans']).level).toBe('error');
    const h = outputHealth(doc, 'o1', computeLayout(doc, 'o1', deps), ['Noto Sans']);
    expect(h.level).toBe('error');
    expect(h.issues).toContainEqual(expect.objectContaining({ sourceId: 'headline', code: 'font-missing', level: 'error' }));
  });

  it('a disconnected output is frozen (grey) unless it has issues', () => {
    const doc = withOutputEdge(filled(project()));
    const r = disconnectOutput(doc, 'o1', deps);
    if (!r.ok) throw new Error(r.error);
    expect(outputHealth(r.doc, 'o1', computeLayout(r.doc, 'o1', deps)).level).toBe('frozen');
  });
});

describe('isEmptyLayer (one test for health, Export and the editors)', () => {
  it('a picture without a file and a text without words are empty; fills never are', () => {
    const doc = project();
    const kinds = Object.fromEntries(doc.sources.map((s) => [s.content.kind, isEmptyLayer(s)]));
    expect(kinds).toMatchObject({ image: true, fill: false });
    const filledDoc = filled(doc);
    expect(filledDoc.sources.some(isEmptyLayer)).toBe(false);
    const blank = filledDoc.sources.find((s) => s.content.kind === 'text');
    if (!blank || blank.content.kind !== 'text') throw new Error('no text layer');
    expect(isEmptyLayer({ ...blank, content: { ...blank.content, text: '   ' } })).toBe(true);
  });
});

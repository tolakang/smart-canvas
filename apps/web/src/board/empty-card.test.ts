import { addOutput, addStack, createProjectDoc, setEmptyCardWired, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { cardEdgeId, docToEdges, stackNodeId } from './flow';
import { panelTitle } from './ZoomLabels';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('an empty Image / Logo node keeps its wire (D49.1)', () => {
  it('is drawn wired into the Layer Comp; once cut, it is not', () => {
    const doc = ok(addStack(createProjectDoc('P'), { id: 'st', board: { x: 0, y: 0 } }));
    const wire = (d: ProjectDoc) => docToEdges(d).find((e) => e.id === cardEdgeId(stackNodeId('st')));
    expect(wire(doc)).toMatchObject({ source: stackNodeId('st'), target: 'main', targetHandle: 'layers' });
    expect(wire(ok(setEmptyCardWired(doc, 'st', false)))).toBeUndefined();
  });
});

describe('zoomed-out Preview tags name the size once', () => {
  const tag = (label: string, width: number, height: number) => panelTitle(ok(addOutput(createProjectDoc('P'), { id: 'o', label, size: { width, height, unit: 'px' } })), 'out:o');
  it('"GDN 1200×200", not "GDN 1200×200 · 1200 × 200 px"', () => {
    expect(tag('GDN 1200×200', 1200, 200)).toBe('GDN 1200×200');
    expect(tag('FB', 2400, 2400)).toBe('FB 2400×2400');
    expect(tag('1080×1920 px', 1080, 1920)).toBe('1080×1920');
  });
});

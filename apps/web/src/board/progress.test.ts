import { addPresetSet, createBoardProject, type ProjectDoc } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { guideSteps, nextStep } from './progress';
import type { ApprovalState } from './review';

const withSize = (doc: ProjectDoc): ProjectDoc => {
  const r = addPresetSet(doc, { id: 'set', label: 'FB', board: { x: 0, y: 0 }, sizes: [{ id: 'o1', label: 'FB post', size: { width: 1080, height: 1080, unit: 'px' } }] });
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const typed = (doc: ProjectDoc): ProjectDoc => ({ ...doc, sources: doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'Sale' } } : s)) });
const done = (doc: ProjectDoc, approvals = new Map<string, ApprovalState>(), exported = false) => Object.fromEntries(guideSteps(doc, approvals, exported).map((s) => [s.id, s.done]));

describe('guideSteps (UX C1)', () => {
  it('a new project has nothing done; the next step is the artwork', () => {
    const doc = createBoardProject('P');
    expect(done(doc)).toEqual({ assets: false, sizes: false, review: false, export: false });
    expect(nextStep(guideSteps(doc, new Map(), false))).toBe('assets');
  });

  it('typed text counts as artwork; a size counts as sizes', () => {
    expect(done(typed(withSize(createBoardProject('P'))))).toMatchObject({ assets: true, sizes: true, review: false });
  });

  it('review is done when every Preview is approved and still current', () => {
    const doc = withSize(createBoardProject('P'));
    expect(done(doc, new Map([['o1', { state: 'approved' }]]))).toMatchObject({ review: true });
    expect(done(doc, new Map([['o1', { state: 'changed' }]]))).toMatchObject({ review: false });
  });

  it('export is what was remembered; with every step done there is no next step', () => {
    const doc = typed(withSize(createBoardProject('P')));
    const steps = guideSteps(doc, new Map([['o1', { state: 'approved' }]]), true);
    expect(nextStep(steps)).toBeNull();
  });
});

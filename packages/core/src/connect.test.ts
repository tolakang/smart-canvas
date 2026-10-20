import { describe, expect, it } from 'vitest';
import { computeLayout, type LayoutDeps } from './layout';
import { expectFrame, mockMeasure, output, place, project } from './layout/test-doc';
import type { Override, ProjectDoc } from './model';
import { disconnectOutput, isOutputConnected, outputWireId, reconnectNeedsChoice, reconnectOutput } from './outputs';
import { setPlacement } from './placement';
import type { SourceResult } from './sources';

const deps: LayoutDeps = { measure: mockMeasure, assets: {} };
const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
/** Default project, subject placed as in example G (with the headline), headline with text, output o1 wired to main. */
function wiredProject(overrides: Override[] = []): ProjectDoc {
  const doc = place(project(output({ overrides })), 'subject', { x: 900, y: 750, w: 1200, h: 1800 });
  return {
    ...doc,
    wires: [...doc.wires, { id: outputWireId('o1'), from: 'main', to: 'o1' }],
    sources: doc.sources.map((s) => (s.id === 'headline' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'AAAAA BBBBB' } } : s)),
  };
}
const at = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);
const ov = (patch: Partial<Override>): Override => ({ sourceId: 'subject', updatedBy: 'u', updatedAt: '2026-01-01T00:00:00Z', ...patch });
const moveSubject = (doc: ProjectDoc) => ok(setPlacement(doc, 'subject', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }));

describe('disconnect (D20, frozen)', () => {
  it('removes the wire and snapshots the computed frames and font sizes', () => {
    const doc = ok(disconnectOutput(wiredProject(), 'o1', deps));
    expect(isOutputConnected(doc, 'o1')).toBe(false);
    const frozen = doc.outputs[0]?.frozen?.items ?? [];
    expect(frozen.map((i) => i.sourceId).sort()).toEqual(['background', 'headline', 'logo', 'subject']);
    expectFrame(frozen.find((i) => i.sourceId === 'subject')?.frame, { x: 308.571429, y: 262.976546, w: 462.857143, h: 694.285714 });
    expect(frozen.find((i) => i.sourceId === 'headline')?.fontSizePx).toBeGreaterThan(0);
  });

  it('while frozen, master moves do not re-flow; content edits still show', () => {
    let doc = ok(disconnectOutput(wiredProject(), 'o1', deps));
    const before = at(doc, 'headline');
    doc = moveSubject(doc);
    doc = { ...doc, sources: doc.sources.map((s) => (s.id === 'headline' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'CCC' } } : s)) };
    expectFrame(at(doc, 'subject')?.frame, { x: 308.571429, y: 262.976546, w: 462.857143, h: 694.285714 });
    expect(at(doc, 'headline')?.lines).toEqual(['CCC']);
    expect(at(doc, 'headline')?.fontSizePx).toBe(before?.fontSizePx);
    // A connected output re-flows (D20)
    expect(at(moveSubject(wiredProject()), 'subject')?.frame.w).toBeCloseTo(231.428571); // 600 · 972/2520
  });

  it('snapshots frames before overrides; overrides keep applying on top', () => {
    const doc = ok(disconnectOutput(wiredProject([ov({ frame: { x: 5 } })]), 'o1', deps));
    expect(doc.outputs[0]?.frozen?.items.find((i) => i.sourceId === 'subject')?.frame.x).toBeCloseTo(308.571429);
    expect(at(moveSubject(doc), 'subject')?.frame.x).toBe(5);
    expect(at(moveSubject(doc), 'subject')?.frame.w).toBeCloseTo(462.857143);
    expect(at(doc, 'subject')?.overridden).toBe(true);
  });

  it('is a no-op when already disconnected and fails for unknown outputs', () => {
    const doc = ok(disconnectOutput(wiredProject(), 'o1', deps));
    expect(ok(disconnectOutput(doc, 'o1', deps))).toBe(doc);
    expect(disconnectOutput(doc, 'nope', deps)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('reconnect (D21)', () => {
  it('without overrides: re-syncs silently (wire back, frozen gone, re-flows)', () => {
    const frozen = moveSubject(ok(disconnectOutput(wiredProject(), 'o1', deps)));
    expect(reconnectNeedsChoice(frozen, 'o1')).toBe(false);
    const doc = ok(reconnectOutput(frozen, 'o1', 'keep'));
    expect(isOutputConnected(doc, 'o1')).toBe(true);
    expect(doc.outputs[0]?.frozen).toBeUndefined();
    expect(at(doc, 'subject')?.frame.w).toBeCloseTo(231.428571);
    expect(doc.wires.filter((w) => w.to === 'o1')).toHaveLength(1);
  });

  it('with overrides: asks; keep keeps them, reset clears them', () => {
    const frozen = ok(disconnectOutput(wiredProject([ov({ frame: { x: 5 } })]), 'o1', deps));
    expect(reconnectNeedsChoice(frozen, 'o1')).toBe(true);
    expect(ok(reconnectOutput(frozen, 'o1', 'keep')).outputs[0]?.overrides).toHaveLength(1);
    const reset = ok(reconnectOutput(frozen, 'o1', 'reset'));
    expect(reset.outputs[0]?.overrides).toEqual([]);
    expect(at(reset, 'subject')?.overridden).toBe(false);
  });
});

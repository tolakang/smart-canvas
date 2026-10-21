import { addOutput, addProcess, createProjectDoc, disconnectOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { paletteItems } from './palette';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
const at = { x: 500, y: 300 };
const doc = () => ok(addOutput(createProjectDoc('P'), { id: 'o1', label: 'Out', size: { width: 1080, height: 1080, unit: 'px' } }));
const labels = (d: ProjectDoc, port: Parameters<typeof paletteItems>[1]) => paletteItems(d, port).map((i) => i.label);

describe('node palette (T12.7)', () => {
  it('out of an input: a process taking it, or a new main preview with it as a row', () => {
    const port = { nodeId: 'src:subject', handleId: null, handleType: 'source' as const };
    expect(labels(doc(), port)).toEqual(['Crop', 'Adjust', 'Flip / Rotate', 'Text variant', 'Recolor', 'New main preview']);
    const [crop] = paletteItems(doc(), port);
    const d = ok(crop?.add(doc(), ids(), at) ?? { ok: false, error: 'invalid' });
    expect(d.processes[0]).toMatchObject({ id: 'n1', op: { type: 'crop' }, board: { x: 500, y: 274 } });
    expect(d.edges.some((e) => e.from === 'subject' && e.to === 'n1')).toBe(true);
    const comp = ok(paletteItems(doc(), port).at(-1)?.add(doc(), ids(), at) ?? { ok: false, error: 'invalid' });
    expect(comp.compositions[1]).toMatchObject({ id: 'n1', layers: ['subject'] });
    expect(comp.edges.some((e) => e.from === 'subject' && e.to === 'n1' && e.kind === 'layer')).toBe(true);
  });

  it('out of a process: the same (chains)', () => {
    const d = ok(addProcess(doc(), { id: 'p1', op: { type: 'flip', x: true, y: false }, board: { x: 0, y: 0 }, input: 'logo' }));
    const next = ok(paletteItems(d, { nodeId: 'proc:p1', handleId: null, handleType: 'source' })[1]?.add(d, ids(), at) ?? { ok: false, error: 'invalid' });
    expect(next.edges.some((e) => e.from === 'p1' && e.to === 'n1')).toBe(true);
  });

  it('out of a main preview: an output following it (default size first, as T10.4)', () => {
    const items = paletteItems(doc(), { nodeId: 'main', handleId: 'out', handleType: 'source' }, [
      { id: 'ig', teamId: null, group: 'social', name: 'Instagram square', size: { width: 1080, height: 1080, unit: 'px' } },
    ]);
    expect(items.map((i) => i.label)).toEqual(['Output 1080×1350 px', 'Instagram square']);
    const d = ok(items[1]?.add(doc(), ids(), at) ?? { ok: false, error: 'invalid' });
    expect(d.outputs.at(-1)).toMatchObject({ id: 'n1', label: 'Instagram square', presetId: 'ig', size: { width: 1080, height: 1080 } });
    expect(d.edges.some((e) => e.kind === 'composition' && e.from === 'main' && e.to === 'n1')).toBe(true);
  });

  it('into a row or a process input: a new input wired there (placed to the left)', () => {
    const row = paletteItems(doc(), { nodeId: 'main', handleId: 'p2', handleType: 'target' });
    expect(row.map((i) => i.label)).toEqual(['Image', 'Logo / SVG', 'Text', 'Background colour']);
    const d = ok(row[2]?.add(doc(), ids(), at) ?? { ok: false, error: 'invalid' });
    expect(d.sources.at(-1)).toMatchObject({ id: 'n1', kind: 'text', board: { x: 240, y: 274 } });
    expect(d.compositions[0]?.layers.indexOf('n1')).toBe(2);
    expect(d.edges.some((e) => e.from === 'n1' && e.to === 'main')).toBe(true);

    const withProc = ok(addProcess(doc(), { id: 'p1', op: { type: 'adjust' }, board: { x: 0, y: 0 } }));
    const fed = ok(paletteItems(withProc, { nodeId: 'proc:p1', handleId: null, handleType: 'target' })[0]?.add(withProc, ids(), at) ?? { ok: false, error: 'invalid' });
    expect(fed.edges.some((e) => e.from === 'n1' && e.to === 'p1')).toBe(true);

    const own = ok(paletteItems(doc(), { nodeId: 'out:o1', handleId: 'p0', handleType: 'target' })[1]?.add(doc(), ids(), at) ?? { ok: false, error: 'invalid' });
    expect(own.outputs[0]?.layers).toEqual(['n1']);
  });

  it("into an output's main preview port: a new main preview, only while disconnected", () => {
    const port = { nodeId: 'out:o1', handleId: null, handleType: 'target' as const };
    expect(paletteItems(doc(), port)).toEqual([]);
    const off = ok(disconnectOutput(doc(), 'o1', { measure: () => 0, assets: {} }));
    const d = ok(paletteItems(off, port)[0]?.add(off, ids(), at) ?? { ok: false, error: 'invalid' });
    expect(d.edges.some((e) => e.kind === 'composition' && e.from === 'n1' && e.to === 'o1')).toBe(true);
    expect(d.outputs[0]?.frozen).toBeUndefined();
  });
});

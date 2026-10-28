import { describe, expect, it } from 'vitest';
import { layerOrder } from './graph';
import type { ProjectDoc } from './model';
import { connectSource, disconnectSource, moveSourceToPort } from './ports';
import { createProjectDoc } from './project';
import { addSource, deleteSource, duplicateSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
// Default stack, front→back: logo 0, headline 1, subject 2, background 3.
const stack = (doc: ProjectDoc) => layerOrder(doc);
const wirePorts = (doc: ProjectDoc) => Object.fromEntries(doc.edges.filter((e) => e.kind === 'layer' && e.to === 'main').map((e) => [e.from, layerOrder(doc).indexOf(e.from)]));
/** Every source is a row of main exactly once (rows = ports, contiguous by construction). */
const consistent = (doc: ProjectDoc) => {
  const rows = layerOrder(doc);
  return rows.length === doc.sources.length && new Set(rows).size === rows.length && doc.sources.every((s) => rows.includes(s.id));
};

describe('moveSourceToPort', () => {
  it('moves one source and shifts the ones in between', () => {
    expect(stack(ok(moveSourceToPort(createProjectDoc('P'), 'background', 0)))).toEqual(['background', 'logo', 'headline', 'subject']);
    expect(stack(ok(moveSourceToPort(createProjectDoc('P'), 'logo', 2)))).toEqual(['headline', 'subject', 'logo', 'background']);
  });

  it('clamps out-of-range ports and rejects unknown sources', () => {
    expect(stack(ok(moveSourceToPort(createProjectDoc('P'), 'logo', 99)))).toEqual(['headline', 'subject', 'background', 'logo']);
    expect(stack(ok(moveSourceToPort(createProjectDoc('P'), 'background', -5)))[0]).toBe('background');
    expect(moveSourceToPort(createProjectDoc('P'), 'nope', 0)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('connect / disconnect', () => {
  it('wiring an input creates one layer edge into its row', () => {
    const doc = ok(connectSource(createProjectDoc('P'), 'subject'));
    expect(doc.edges).toEqual([{ id: 'in:subject', from: 'subject', to: 'main', kind: 'layer' }]);
    expect(layerOrder(doc).indexOf('subject')).toBe(2);
    expect(ok(connectSource(doc, 'subject')).edges).toHaveLength(1); // idempotent
  });

  it('wiring onto another port re-orders (re-wire reorders, D11)', () => {
    let doc = ok(connectSource(createProjectDoc('P'), 'logo'));
    doc = ok(connectSource(doc, 'subject', 0));
    expect(stack(doc)).toEqual(['subject', 'logo', 'headline', 'background']);
    expect(wirePorts(doc)).toEqual({ logo: 1, subject: 0 });
    // Re-wiring an already-wired input moves it, still one wire.
    doc = ok(connectSource(doc, 'logo', 3));
    expect(stack(doc)).toEqual(['subject', 'headline', 'background', 'logo']);
    expect(wirePorts(doc)).toEqual({ logo: 3, subject: 0 });
    expect(consistent(doc)).toBe(true);
  });

  it('disconnecting keeps the input in its place in the stack', () => {
    const wired = ok(connectSource(createProjectDoc('P'), 'headline'));
    const doc = ok(disconnectSource(wired, 'headline'));
    expect(doc.edges.some((e) => e.kind === 'layer' && e.from === 'headline')).toBe(false);
    expect(stack(doc)).toEqual(stack(wired));
  });

  it('leaves main→output edges alone', () => {
    const doc0: ProjectDoc = { ...createProjectDoc('P'), edges: [{ id: 'o', from: 'main', to: 'ig', kind: 'composition' }] };
    const doc = ok(disconnectSource(ok(connectSource(doc0, 'logo', 2)), 'logo'));
    expect(doc.edges).toEqual([{ id: 'o', from: 'main', to: 'ig', kind: 'composition' }]);
  });
});

describe('ports stay contiguous and wires follow, whatever the edit', () => {
  it('through add, duplicate, move and delete', () => {
    let doc = createProjectDoc('P');
    for (const id of ['background', 'subject', 'headline', 'logo']) doc = ok(connectSource(doc, id));
    doc = ok(addSource(doc, { id: 'n', kind: 'text', label: 'Small', behavesLike: 'text' })); // goes to port 0, all shift
    doc = ok(duplicateSource(doc, 'subject', 's2'));
    doc = ok(moveSourceToPort(doc, 'background', 1));
    doc = ok(deleteSource(doc, 'headline'));
    expect(consistent(doc)).toBe(true);
    expect(stack(doc)).toEqual(['n', 'background', 'logo', 's2', 'subject']);
    expect(Object.keys(wirePorts(doc)).sort()).toEqual(['background', 'logo', 's2', 'subject']); // the copy of a wired source is wired (T8.1)
  });
});

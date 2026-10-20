import { describe, expect, it } from 'vitest';
import type { ProjectDoc } from './model';
import { connectSource, disconnectSource, inputWire, moveSourceToPort } from './ports';
import { createProjectDoc } from './project';
import { addSource, deleteSource, duplicateSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
// Default stack, front→back: logo 0, headline 1, subject 2, background 3.
const stack = (doc: ProjectDoc) => [...doc.sources].sort((a, b) => a.port - b.port).map((s) => s.id);
const wirePorts = (doc: ProjectDoc) => Object.fromEntries(doc.wires.filter((w) => w.to === 'main').map((w) => [w.from, w.port]));
/** Every source→main wire carries its source's port. */
const consistent = (doc: ProjectDoc) => doc.wires.filter((w) => w.to === 'main').every((w) => doc.sources.find((s) => s.id === w.from)?.port === w.port);

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
  it('wiring an input creates one wire at its port', () => {
    const doc = ok(connectSource(createProjectDoc('P'), 'subject'));
    expect(doc.wires).toEqual([{ id: 'in:subject', from: 'subject', to: 'main', port: 2 }]);
    expect(ok(connectSource(doc, 'subject')).wires).toHaveLength(1); // idempotent
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
    expect(inputWire(doc, 'headline')).toBeUndefined();
    expect(stack(doc)).toEqual(stack(wired));
  });

  it('leaves main→output wires alone', () => {
    const doc0 = { ...createProjectDoc('P'), wires: [{ id: 'o', from: 'main', to: 'ig' }] };
    const doc = ok(disconnectSource(ok(connectSource(doc0, 'logo', 2)), 'logo'));
    expect(doc.wires).toEqual([{ id: 'o', from: 'main', to: 'ig' }]);
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
    const ports = doc.sources.map((s) => s.port).sort((a, b) => a - b);
    expect(ports).toEqual(ports.map((_, i) => i));
    expect(consistent(doc)).toBe(true);
    expect(Object.keys(wirePorts(doc)).sort()).toEqual(['background', 'logo', 's2', 'subject']); // the copy of a wired source is wired (T8.1)
  });
});

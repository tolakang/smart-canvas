import { createProjectDoc, mainComposition, type ProjectDoc } from '@smart-canvas/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, type SaveFn, type SaveState } from './autosave';
import {
  connectionRefusal,
  docToEdges,
  edgeOfConnection,
  docToNodes,
  isInputToMain,
  isMainToOutput,
  MAIN_ID,
  outputIdOfNode,
  portFromHandle,
  portRows,
  sourceIdOfNode,
  syncNodes,
  withPositions,
} from './flow';

function sampleDoc(): ProjectDoc {
  const base = createProjectDoc('P');
  const doc: ProjectDoc = { ...base, sources: [], compositions: base.compositions.map((c) => ({ ...c, layers: ['bg'] })) };
  doc.sources.push({
    id: 'bg',
    label: 'Background',
    kind: 'fill',
    behavesLike: 'background',
    visible: true,
    content: { kind: 'fill', fill: { type: 'solid', color: '#fff' } },
    board: { x: -300, y: 0 },
  });
  doc.outputs.push(
    { id: 'ig', label: 'Instagram', size: { width: 1080, height: 1080, unit: 'px' }, family: 'auto', overrides: [], board: { x: 400, y: 0 } },
    { id: 'a4', label: 'A4', size: { width: 210, height: 297, unit: 'mm' }, family: 'auto', overrides: [], board: { x: 400, y: 200 } },
  );
  doc.edges.push({ id: 'w1', from: 'bg', to: 'main', kind: 'layer' }, { id: 'w2', from: 'main', to: 'ig', kind: 'composition' });
  return doc;
}

describe('docToNodes / docToEdges', () => {
  it('makes one node per source, the main preview and each output, at their board positions', () => {
    const nodes = docToNodes(sampleDoc());
    expect(nodes.map((n) => [n.id, n.type, n.position])).toEqual([
      ['src:bg', 'inputNode', { x: -300, y: 0 }],
      ['main', 'mainNode', { x: 0, y: 0 }],
      ['out:ig', 'outputNode', { x: 400, y: 0 }],
      ['out:a4', 'outputNode', { x: 400, y: 200 }],
    ]);
    // An output is connected iff a main→output wire exists (DATA-MODEL Wire doc).
    expect(nodes.filter((n) => n.type === 'outputNode').map((n) => [n.id, n.data.connected])).toEqual([
      ['out:ig', true],
      ['out:a4', false],
    ]);
  });

  it('maps wires to edges: inputs land on their port handle; all wires are deletable', () => {
    expect(docToEdges(sampleDoc())).toEqual([
      { id: 'w1', source: 'src:bg', target: 'main', targetHandle: 'p0', className: 'sc-edge--layer', deletable: true },
      { id: 'w2', source: 'main', target: 'out:ig', sourceHandle: 'out', className: 'sc-edge--composition', deletable: true },
    ]);
  });

  it('lists the main preview ports front first, with wired state', () => {
    const doc = createProjectDoc('P');
    doc.edges.push({ id: 'in:subject', from: 'subject', to: 'main', kind: 'layer' });
    doc.sources = doc.sources.map((s) => (s.id === 'logo' ? { ...s, visible: false } : s));
    expect(portRows(doc)).toEqual([
      { port: 0, sourceId: 'logo', label: 'Logo', visible: false, connected: false },
      { port: 1, sourceId: 'headline', label: 'Headline', visible: true, connected: false },
      { port: 2, sourceId: 'subject', label: 'Subject', visible: true, connected: true },
      { port: 3, sourceId: 'background', label: 'Background', visible: true, connected: false },
    ]);
  });

  it('parses port handles and only allows input → main connections', () => {
    expect(portFromHandle('p3')).toBe(3);
    expect(portFromHandle('out')).toBeUndefined();
    expect(portFromHandle(null)).toBeUndefined();
    expect(isInputToMain({ source: 'src:logo', target: 'main' })).toBe(true);
    expect(isInputToMain({ source: 'main', target: 'out:ig' })).toBe(false);
    expect(isInputToMain({ source: 'src:logo', target: 'src:bg' })).toBe(false);
    expect(isMainToOutput({ source: 'main', target: 'out:ig' })).toBe(true);
    expect(isMainToOutput({ source: 'src:logo', target: 'out:ig' })).toBe(false);
    expect(outputIdOfNode('out:ig')).toBe('ig');
    expect(outputIdOfNode('main')).toBeUndefined();
    expect(sourceIdOfNode('src:logo')).toBe('logo');
    expect(sourceIdOfNode('main')).toBeUndefined();
  });

  it('a new project shows its 4 default inputs and the main preview', () => {
    expect(docToNodes(createProjectDoc('New')).map((n) => n.id)).toEqual([
      'src:background',
      'src:subject',
      'src:headline',
      'src:logo',
      MAIN_ID,
    ]);
  });
});

describe('syncNodes', () => {
  it('takes data from the doc but keeps position, selection and size from the canvas', () => {
    const doc = sampleDoc();
    const current = docToNodes(doc).map((n) => (n.id === 'out:ig' ? { ...n, position: { x: 999, y: 9 }, selected: true, measured: { width: 160, height: 60 } } : n));
    const renamed = { ...doc, outputs: doc.outputs.map((o) => (o.id === 'ig' ? { ...o, label: 'IG square' } : o)) };
    const next = syncNodes(current, docToNodes(renamed));
    const ig = next.find((n) => n.id === 'out:ig');
    expect(ig?.position).toEqual({ x: 999, y: 9 });
    expect(ig?.selected).toBe(true);
    expect(ig?.measured).toEqual({ width: 160, height: 60 });
    expect(ig?.type === 'outputNode' && ig.data.output.label).toBe('IG square');
  });

  it('adds new nodes as they come from the doc and drops removed ones', () => {
    const doc = sampleDoc();
    const fewer = { ...doc, outputs: doc.outputs.slice(0, 1) };
    expect(syncNodes(docToNodes(fewer), docToNodes(doc)).map((n) => n.id)).toContain('out:a4');
    expect(syncNodes(docToNodes(doc), docToNodes(fewer)).map((n) => n.id)).not.toContain('out:a4');
  });
});

describe('withPositions', () => {
  it('writes rounded positions back into the doc without touching anything else', () => {
    const doc = sampleDoc();
    const next = withPositions(doc, [
      { id: 'main', position: { x: 10.4, y: 20.6 } },
      { id: 'out:a4', position: { x: 500, y: 300 } },
      { id: 'src:missing', position: { x: 1, y: 1 } },
    ]);
    expect(mainComposition(next).board).toEqual({ x: 10, y: 21 });
    expect(next.outputs[1]?.board).toEqual({ x: 500, y: 300 });
    expect(next.outputs[0]).toBe(doc.outputs[0]);
    expect(next.sources[0]).toBe(doc.sources[0]);
    expect(mainComposition(doc).board).toEqual({ x: 0, y: 0 }); // input not mutated
  });
});

class Conflict extends Error {}

describe('Autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const named = (name: string) => ({ ...createProjectDoc(name) });

  function setup(save: SaveFn) {
    const states: SaveState[] = [];
    const a = new Autosave({ rev: 0, save, isConflict: (e) => e instanceof Conflict, onState: (s) => states.push(s), delayMs: 500 });
    return { a, states };
  }

  it('debounces changes and sends only the latest doc with the current rev', async () => {
    const save = vi.fn<SaveFn>(async (rev) => ({ rev: rev + 1 }));
    const { a, states } = setup(save);
    a.change(named('a'));
    await vi.advanceTimersByTimeAsync(300);
    a.change(named('b'));
    await vi.advanceTimersByTimeAsync(300);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toBe(0);
    expect(save.mock.calls[0]?.[1].name).toBe('b');
    expect(a.rev).toBe(1);
    expect(states).toEqual(['pending', 'saving', 'saved']);
  });

  it('keeps one save in flight and sends edits made meanwhile right after, on the new rev', async () => {
    let release: (v: { rev: number }) => void = () => {};
    const save = vi.fn<SaveFn>(
      () =>
        new Promise<{ rev: number }>((resolve) => {
          release = resolve;
        }),
    );
    const { a } = setup(save);
    a.change(named('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);

    a.change(named('b'));
    a.change(named('c'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1); // still waiting on the first

    release({ rev: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toBe(1);
    expect(save.mock.calls[1]?.[1].name).toBe('c');
    release({ rev: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.rev).toBe(2);
    expect(a.state).toBe('saved');
  });

  it('stops on a stale-rev conflict and ignores further changes', async () => {
    const save = vi.fn<SaveFn>(async () => {
      throw new Conflict();
    });
    const { a, states } = setup(save);
    a.change(named('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(a.state).toBe('conflict');
    a.change(named('b'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('conflict');
  });

  it('retries other failures with backoff, sending the newest doc', async () => {
    let fail = 2;
    const save = vi.fn<SaveFn>(async (rev) => {
      if (fail-- > 0) throw new Error('network');
      return { rev: rev + 1 };
    });
    const { a } = setup(save);
    a.change(named('a'));
    await vi.advanceTimersByTimeAsync(500); // attempt 1 fails → retry in 500
    expect(a.state).toBe('error');
    await vi.advanceTimersByTimeAsync(500); // attempt 2 fails → retry in 1000
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(a.state).toBe('saved');
    expect(save.mock.calls.every(([, doc]) => doc.name === 'a')).toBe(true);
  });

  it('flush saves immediately', async () => {
    const save = vi.fn<SaveFn>(async (rev) => ({ rev: rev + 1 }));
    const { a } = setup(save);
    a.change(named('a'));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.state).toBe('saved');
  });
});

describe('typed connections (T12.2, D32)', () => {
  it('maps board connections to typed edges', () => {
    expect(edgeOfConnection({ source: 'src:bg', target: MAIN_ID })).toEqual({ from: 'bg', to: 'main', kind: 'layer' });
    expect(edgeOfConnection({ source: MAIN_ID, target: 'out:a4' })).toEqual({ from: 'main', to: 'a4', kind: 'composition' });
    expect(edgeOfConnection({ source: null, target: MAIN_ID })).toBeNull();
  });

  it('allows input → main row and main → a free output; says why otherwise', () => {
    const doc = sampleDoc();
    expect(connectionRefusal(doc, { source: 'src:bg', target: MAIN_ID })).toBeNull();
    expect(connectionRefusal(doc, { source: MAIN_ID, target: 'out:a4' })).toBeNull();
    expect(connectionRefusal(doc, { source: MAIN_ID, target: 'out:ig' })).toBe('This output already has a main preview: drag its wire off first.');
    expect(connectionRefusal(doc, { source: 'src:bg', target: 'out:ig' })).toBe('An input wires into a row of a main preview.'); // output-only layers: T12.4
    expect(connectionRefusal(doc, { source: 'out:ig', target: MAIN_ID })).toBe('An input wires into a row of a main preview.');
  });
});

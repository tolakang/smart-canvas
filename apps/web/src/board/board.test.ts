import { createProjectDoc, type ProjectDoc } from '@smart-canvas/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, type SaveFn, type SaveState } from './autosave';
import { docToEdges, docToNodes, MAIN_ID, withPositions } from './flow';

function sampleDoc(): ProjectDoc {
  const doc = createProjectDoc('P');
  doc.sources.push({
    id: 'bg',
    label: 'Background',
    kind: 'fill',
    behavesLike: 'background',
    port: 0,
    visible: true,
    content: { kind: 'fill', fill: { type: 'solid', color: '#fff' } },
    board: { x: -300, y: 0 },
  });
  doc.outputs.push(
    { id: 'ig', label: 'Instagram', size: { width: 1080, height: 1080, unit: 'px' }, family: 'auto', overrides: [], board: { x: 400, y: 0 } },
    { id: 'a4', label: 'A4', size: { width: 210, height: 297, unit: 'mm' }, family: 'auto', overrides: [], board: { x: 400, y: 200 } },
  );
  doc.wires.push({ id: 'w1', from: 'bg', to: 'main', port: 0 }, { id: 'w2', from: 'main', to: 'ig' });
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

  it('maps wires to edges between node ids', () => {
    expect(docToEdges(sampleDoc())).toEqual([
      { id: 'w1', source: 'src:bg', target: 'main', label: 'port 0' },
      { id: 'w2', source: 'main', target: 'out:ig', label: undefined },
    ]);
  });

  it('a new project shows just the main preview', () => {
    expect(docToNodes(createProjectDoc('New')).map((n) => n.id)).toEqual([MAIN_ID]);
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
    expect(next.master.board).toEqual({ x: 10, y: 21 });
    expect(next.outputs[1]?.board).toEqual({ x: 500, y: 300 });
    expect(next.outputs[0]).toBe(doc.outputs[0]);
    expect(next.sources[0]).toBe(doc.sources[0]);
    expect(doc.master.board).toEqual({ x: 0, y: 0 }); // input not mutated
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

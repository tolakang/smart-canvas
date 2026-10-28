import { addPresetSet, addPicturesToStack, addStack, createProjectDoc, mainComposition, type ProjectDoc } from '@smart-canvas/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, type SaveFn, type SaveState } from './autosave';
import {
  connectionRefusal,
  docToEdges,
  edgeOfConnection,
  docToNodes,
  compositionToOutput,
  inputToComposition,
  MAIN_ID,
  outputIdOfNode,
  portFromHandle,
  sourceIdOfNode,
  stackNodeId,
  setNodeId,
  cardEdgeId,
  setInEdgeId,
  setRowHandle,
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
    { id: 'ig', label: 'Instagram', size: { width: 1080, height: 1080, unit: 'px' }, overrides: [], board: { x: 400, y: 0 } },
    { id: 'a4', label: 'A4', size: { width: 210, height: 297, unit: 'mm' }, overrides: [], board: { x: 400, y: 200 } },
  );
  doc.edges.push({ id: 'w1', from: 'bg', to: 'main', kind: 'layer' }, { id: 'w2', from: 'main', to: 'ig', kind: 'composition' });
  return doc;
}

describe('docToNodes / docToEdges', () => {
  it('makes one node per source, the master preview and each output, at their board positions', () => {
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

  it('maps wires to edges: asset nodes into the Layer Comp top (D49); an output outside a Preset node has no wire', () => {
    expect(docToEdges(sampleDoc())).toEqual([
      // T13.8: every wire is a 'routed' edge carrying its reroute points.
      { id: 'w1', type: 'routed', data: { points: [] }, source: 'src:bg', target: 'main', targetHandle: 'layers', className: 'sc-edge--layer', deletable: true },
    ]);
  });

  it('parses port handles and only allows input → main connections', () => {
    expect(portFromHandle('p3')).toBe(3);
    expect(portFromHandle('out')).toBeUndefined();
    expect(portFromHandle(null)).toBeUndefined();
    expect(inputToComposition({ source: 'src:logo', target: 'main' })).toBe('main');
    expect(inputToComposition({ source: 'src:logo', target: 'comp:b' })).toBe('b'); // any composition
    expect(inputToComposition({ source: 'main', target: 'out:ig' })).toBeUndefined();
    expect(inputToComposition({ source: 'src:logo', target: 'src:bg' })).toBeUndefined();
    expect(compositionToOutput({ source: 'main', target: 'out:ig' })).toBe('main');
    expect(compositionToOutput({ source: 'comp:b', target: 'out:ig' })).toBe('b');
    expect(compositionToOutput({ source: 'src:logo', target: 'out:ig' })).toBeUndefined();
    expect(outputIdOfNode('out:ig')).toBe('ig');
    expect(outputIdOfNode('main')).toBeUndefined();
    expect(sourceIdOfNode('src:logo')).toBe('logo');
    expect(sourceIdOfNode('main')).toBeUndefined();
  });

  it('a new project shows its 4 default inputs and the master preview', () => {
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

  it('follows a node shown / hidden by the doc even when its data is unchanged (D51 eye)', () => {
    const doc = sampleDoc();
    const shown = docToNodes(doc);
    const hidden = docToNodes(doc).map((n) => (n.id === 'out:a4' ? { ...n, hidden: true } : n));
    expect(syncNodes(shown, hidden).find((n) => n.id === 'out:a4')?.hidden).toBe(true);
    expect(syncNodes(hidden, shown).find((n) => n.id === 'out:a4')?.hidden).toBeUndefined();
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
    expect(connectionRefusal(doc, { source: MAIN_ID, target: 'out:ig' })).toBe('This Preview is already wired to Main Comps: drag its wire off first.');
    // D56: no output-only layers.
    expect(connectionRefusal(doc, { source: 'src:bg', target: 'out:ig', targetHandle: 'p0' })).toBe('An input wires into a row of Main Comps.');
    expect(connectionRefusal(doc, { source: 'out:ig', target: MAIN_ID })).toBe('An input wires into a row of Main Comps.');
  });
});

describe('Assets cards on the board (D40)', () => {
  const withCard = (): ProjectDoc => {
    const made = addStack(createProjectDoc('P'), { id: 'st', board: { x: -600, y: 40 } });
    if (!made.ok) throw new Error(made.error);
    const filled = addPicturesToStack(made.doc, 'st', [
      { id: 'a', label: 'a', kind: 'image', assetId: 'x1' },
      { id: 'b', label: 'b', kind: 'image', assetId: 'x2' },
    ]);
    if (!filled.ok) throw new Error(filled.error);
    return filled.doc;
  };

  it('draws one card for its pictures (not a node each), and one wire from the card into the Layer Comp (D49)', () => {
    const doc = withCard();
    const nodes = docToNodes(doc);
    const card = nodes.find((n) => n.id === stackNodeId('st'));
    expect(card).toMatchObject({ type: 'assetsNode', position: { x: -600, y: 40 } });
    expect((card?.data as { items: { id: string }[] }).items.map((s) => s.id)).toEqual(['a', 'b']);
    expect(nodes.some((n) => n.id === 'src:a' || n.id === 'src:b')).toBe(false);
    const edges = docToEdges(doc).filter((e) => e.source === stackNodeId('st'));
    expect(edges.map((e) => [e.id, e.target, e.targetHandle])).toEqual([[cardEdgeId(stackNodeId('st')), MAIN_ID, 'layers']]);
  });

  it('a card wires into a master preview only; moving it writes its position', () => {
    const doc = withCard();
    expect(connectionRefusal(doc, { source: stackNodeId('st'), target: MAIN_ID })).toBeNull();
    expect(connectionRefusal(doc, { source: stackNodeId('st'), target: 'out:x' })).toMatch(/Main Comps/);
    expect(withPositions(doc, [{ id: stackNodeId('st'), position: { x: 10.4, y: 20.6 } }]).stacks?.[0]?.board).toEqual({ x: 10, y: 21 });
  });
});

describe('Preset nodes on the board (D46)', () => {
  const withSet = () => {
    const r = addPresetSet(sampleDoc(), { id: 'gdn', label: 'GDN', board: { x: 0, y: 600 }, sizes: [
      { id: 'g1', label: 'GDN 300×250', size: { width: 300, height: 250, unit: 'px' } },
      { id: 'g2', label: 'GDN 728×90', size: { width: 728, height: 90, unit: 'px' } },
    ] });
    if (!r.ok) throw new Error(r.error);
    return r.doc;
  };

  it('draws one wire into the Preset node and one from each row to its preview', () => {
    const doc = withSet();
    const node = docToNodes(doc).find((n) => n.id === setNodeId('gdn'));
    expect(node?.type).toBe('presetNode');
    expect(node?.data).toMatchObject({ rows: [{ output: { id: 'g1' }, connected: true }, { output: { id: 'g2' }, connected: true }] });
    const edges = docToEdges(doc).filter((e) => e.source === setNodeId('gdn') || e.target === setNodeId('gdn'));
    expect(edges.map((e) => [e.id, e.source, e.sourceHandle, e.target])).toEqual([
      [setInEdgeId('gdn'), MAIN_ID, 'out', setNodeId('gdn')],
      [doc.edges.find((e) => e.to === 'g1')?.id, setNodeId('gdn'), setRowHandle('g1'), 'out:g1'],
      [doc.edges.find((e) => e.to === 'g2')?.id, setNodeId('gdn'), setRowHandle('g2'), 'out:g2'],
    ]);

  });

  it('D51: a row’s wire has no ✂ badge; a hidden Preview is off the board', () => {
    const doc = withSet();
    expect(docToEdges(doc).filter((e) => e.source === setNodeId('gdn')).every((e) => (e.data as { noCut?: boolean }).noCut)).toBe(true);
    const hidden = { ...doc, presetSets: doc.presetSets?.map((s) => ({ ...s, hidden: ['g2'] })) };
    expect(docToNodes(hidden).find((n) => n.id === 'out:g2')?.hidden).toBe(true);
    expect(docToNodes(hidden).find((n) => n.id === 'out:g1')?.hidden).toBeUndefined();
  });

  it('a disconnected row draws no wire; with none left, no wire goes in', () => {
    const doc = { ...withSet(), edges: withSet().edges.filter((e) => e.to !== 'g1') };
    expect(docToEdges(doc).filter((e) => e.source === setNodeId('gdn')).map((e) => e.target)).toEqual(['out:g2']);
    const none = { ...doc, edges: doc.edges.filter((e) => e.to !== 'g2') };
    expect(docToEdges(none).some((e) => e.target === setNodeId('gdn') || e.source === setNodeId('gdn'))).toBe(false);
  });

  it('a master preview may wire into a Preset node; a row only into its own preview', () => {
    const doc = withSet();
    expect(connectionRefusal(doc, { source: MAIN_ID, sourceHandle: 'out', target: setNodeId('gdn'), targetHandle: null })).toBeNull();
    expect(connectionRefusal(doc, { source: 'src:bg', sourceHandle: null, target: setNodeId('gdn'), targetHandle: null })).not.toBeNull();
    expect(connectionRefusal(doc, { source: setNodeId('gdn'), sourceHandle: setRowHandle('g1'), target: 'out:g1', targetHandle: null })).toBeNull();
    expect(connectionRefusal(doc, { source: setNodeId('gdn'), sourceHandle: setRowHandle('g1'), target: 'out:g2', targetHandle: null })).not.toBeNull();
  });

  it('moving the node writes its board position', () => {
    const doc = withPositions(withSet(), [{ id: setNodeId('gdn'), position: { x: 10.4, y: 20.6 } }]);
    expect(doc.presetSets?.[0]?.board).toEqual({ x: 10, y: 21 });
  });
});

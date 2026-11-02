/**
 * What can be added on the board, and where it goes (D49, N4; clean-up 2, U8: moved out of Board.tsx as they were):
 * the asset nodes and the Preset nodes, for + Add, the canvas's right-click menu and Main Comps' "Add sizes".
 */
import { addLanguagePair, addPresetSet, addSource, addStack, addTextToStack, connectSource, LIMITS, presetFamilies, type ProjectDoc, type SizePreset, type SourceResult } from '@smart-canvas/core';
import type { Edge, ReactFlowInstance } from '@xyflow/react';
import type { MenuItem } from './ContextMenu';
import { MAIN_ID, type BoardNode, type FlowNode } from './flow';
import { newId } from './ids';
import { familySetSpec, familySize } from './preset-family';
import { boxOf, clearSpot, presetBlock } from './tidy';

type At = { x: number; y: number };

export interface AddMenuDeps {
  docRef: React.MutableRefObject<ProjectDoc>;
  nodesRef: React.MutableRefObject<BoardNode[]>;
  flow: React.MutableRefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  presets: SizePreset[];
  run: (op: (doc: ProjectDoc) => SourceResult) => SourceResult;
}

/** Built every render (it reads `presets`), as a hook because it takes the board's refs; the board keeps the latest in refs for callbacks that outlive the render. */
export function useAddMenus({ docRef, nodesRef, flow, presets, run }: AddMenuDeps) {
  /** N4: where a Preset node of `rows` sizes goes near `at` — its node and its Previews clear of every other node. */
  const clearAt = (at: At, rows: number) => clearSpot(nodesRef.current.filter((n) => !n.hidden).map(boxOf), presetBlock(rows), at);

  /** D46 / D49: a Preset node with every size of a preset family (e.g. the 7 GDN sizes), wired to Main Comps. */
  const addSet = (family: string, at: At) => {
    run((d) => addPresetSet(d, familySetSpec(presets, family, clearAt(at, familySize(presets, family)), newId)));
  };

  /** D49: the Preset nodes on offer — every preset family, then a custom one (the user's own sizes). */
  const presetItems = (at: At): MenuItem[] => {
    const doc = docRef.current;
    return [
      ...presetFamilies(presets).map((f) => ({
        label: `${f.label} preset (${f.presets.length} ${f.presets.length === 1 ? 'size' : 'sizes'})`,
        disabled: doc.outputs.length + f.presets.length > LIMITS.maxOutputs,
        onSelect: () => addSet(f.label, at),
      })),
      { label: 'Custom preset…', separated: true, onSelect: () => run((d) => addPresetSet(d, { id: newId(), label: window.prompt('Preset name', 'Custom')?.trim() || 'Custom', board: clearAt(at, 1), sizes: [] })) },
    ];
  };

  /** UX B2 / C3: Main Comps' "Add sizes" chips — a Preset node placed under the Main Comps group. */
  const addSizes = (family: string | null) => {
    const main = nodesRef.current.find((n) => n.id === MAIN_ID);
    const at = main ? { x: main.position.x, y: main.position.y + (main.measured?.height ?? 400) + 120 } : { x: 0, y: 0 };
    if (family) addSet(family, at);
    else run((d) => addPresetSet(d, { id: newId(), label: window.prompt('Preset name', 'Custom')?.trim() || 'Custom', board: clearAt(at, 1), sizes: [] }));
  };

  /** D49 (page 3): what can be added on the board — the asset nodes, then the Preset nodes. */
  const addItems = (at: At): MenuItem[] => {
    const full = docRef.current.sources.length >= LIMITS.maxSources;
    return [
      { label: 'Logo node', disabled: full, onSelect: () => run((d) => addStack(d, { id: newId(), kind: 'logo', board: at })) },
      { label: 'Headline node (Khmer / English)', disabled: full, onSelect: () => run((d) => addLanguagePair(d, { id: newId(), km: newId(), en: newId(), board: at })) },
      {
        label: 'Text node',
        disabled: full,
        onSelect: () =>
          run((d) => {
            const id = newId();
            const r = addStack(d, { id, kind: 'text', board: at });
            return r.ok ? addTextToStack(r.doc, id, { id: newId(), label: 'Text 1' }) : r;
          }),
      },
      { label: 'Image node', disabled: full, onSelect: () => run((d) => addStack(d, { id: newId(), label: 'Image', board: at })) },
      {
        label: 'Background node',
        disabled: full,
        onSelect: () =>
          run((d) => {
            const id = newId();
            const r = addSource(d, { id, kind: 'image', label: 'Background', behavesLike: 'background', board: at });
            return r.ok ? connectSource(r.doc, id) : r;
          }),
      },
      ...presetItems(at).map((item, i) => ({ ...item, separated: i === 0 })),
    ];
  };

  /**
   * D49: where + Add puts a node: asset nodes at the end of the top row, Preset nodes in a column under the Layer
   * Comp group (each below the last), so nothing lands on top of the group.
   */
  const nextSpot = (): { asset: At; preset: At } => {
    const d = docRef.current;
    const main = d.compositions.find((c) => c.id === MAIN_ID);
    const ns = flow.current?.getNodes() ?? [];
    const right = (n: { position: { x: number }; measured?: { width?: number } }) => n.position.x + (n.measured?.width ?? 280);
    const top = ns.filter((n) => n.type === 'assetsNode' || n.type === 'textNode' || n.type === 'headlineNode' || n.type === 'inputNode');
    const sets = ns.filter((n) => n.type === 'presetNode');
    const below = (n: { position: { y: number }; measured?: { height?: number } }) => n.position.y + (n.measured?.height ?? 400);
    return {
      asset: { x: top.length ? Math.max(...top.map(right)) + 40 : 0, y: top.length ? Math.min(...top.map((n) => n.position.y)) : 0 },
      preset: { x: main?.board.x ?? 0, y: sets.length ? Math.max(...sets.map(below)) + 60 : (main?.board.y ?? 0) + 560 },
    };
  };

  return { presetItems, addSizes, addItems, nextSpot };
}

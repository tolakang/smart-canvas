/**
 * Node palette (T12.7, generalising T10.4): the nodes that fit a port, each added and wired in one step.
 * Opened by dropping a wire on empty canvas, or by right-clicking a port.
 * - a `layer` out port (input, process): a process taking it, or a new main preview with it as a row;
 * - a main preview's out port: an output following it (default size, or a preset);
 * - a `layer` in port (a main preview or output row, a process's input): a new input wired into it;
 * - an output's main-preview port (while disconnected): a new main preview wired into it.
 * Pure: the board turns items into menu entries and runs `add` on the doc.
 */
import {
  addComposition,
  addOutput,
  addProcess,
  addSource,
  connectOutputLayer,
  connectProcessInput,
  connectSource,
  DEFAULT_OPS,
  isOutputConnected,
  LIMITS,
  outputDefaults,
  PROCESS_LABEL,
  reconnectOutput,
  type ProcessOp,
  type ProjectDoc,
  type SizePreset,
  type SourceResult,
} from '@smart-canvas/core';
import type { NewInput } from './AddInputDialog';
import { presetSettings } from './OutputNode';
import { compositionIdOfNode, LAYER_OUT_HANDLE, layerIdOfNode, OUTPUT_HANDLE, outputIdOfNode, portFromHandle, processIdOfNode } from './flow';

/** The port a palette is for (React Flow ids). */
export interface PalettePort {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target';
}

export interface PaletteItem {
  label: string;
  disabled?: boolean;
  /** Starts a group in the menu. */
  separated?: boolean;
  /** Adds the node (ids from `newId`) at flow point `at` and wires it to the port. */
  add: (doc: ProjectDoc, newId: () => string, at: { x: number; y: number }) => SourceResult;
}

/** Default output size for a new output (T10.4). */
export const NEW_OUTPUT_SIZE = { width: 1080, height: 1350, unit: 'px' } as const;
/** How far below a node's top its left port sits, so a new node's port lands on the drop point. */
const PORT_Y = 26;
/** A node added upstream (dragged out of an in port) goes this far left of the drop point. */
const UPSTREAM_GAP = 260;

const INPUTS: { label: string; input: NewInput }[] = [
  { label: 'Image', input: { kind: 'image', label: 'Image', behavesLike: 'subject' } },
  { label: 'Logo / SVG', input: { kind: 'vector', label: 'Logo', behavesLike: 'logo' } },
  { label: 'Text', input: { kind: 'text', label: 'Text', behavesLike: 'text' } },
  { label: 'Background colour', input: { kind: 'fill', label: 'Background', behavesLike: 'background' } },
];
const PROCESS_KINDS = ['crop', 'adjust', 'flip', 'textVariant', 'recolor'] as const;

const chain = (r: SourceResult, next: (doc: ProjectDoc) => SourceResult): SourceResult => (r.ok ? next(r.doc) : r);
const label = (s: { width: number; height: number; unit: string }) => `${s.width}×${s.height} ${s.unit}`;

export function paletteItems(doc: ProjectDoc, port: PalettePort, presets: readonly SizePreset[] = []): PaletteItem[] {
  const { nodeId, handleId, handleType } = port;
  const composition = compositionIdOfNode(nodeId);
  // T12.8: a composition's layer port carries the composition itself.
  const nest = handleType === 'source' && handleId === LAYER_OUT_HANDLE ? composition : undefined;
  const layer = nest ?? layerIdOfNode(nodeId);
  const output = outputIdOfNode(nodeId);
  const process = processIdOfNode(nodeId);
  const processesFull = doc.processes.length >= LIMITS.maxProcesses;
  const inputsFull = doc.sources.length >= LIMITS.maxSources;
  const compsFull = doc.compositions.length >= LIMITS.maxCompositions;
  const outputsFull = doc.outputs.length >= LIMITS.maxOutputs;
  const downstream = (at: { x: number; y: number }) => ({ x: at.x, y: at.y - PORT_Y });
  const upstream = (at: { x: number; y: number }) => ({ x: at.x - UPSTREAM_GAP, y: at.y - PORT_Y });

  if (handleType === 'source' && layer) {
    return [
      ...(nest ? [] : PROCESS_KINDS).map(
        (kind): PaletteItem => ({
          label: PROCESS_LABEL[kind],
          disabled: processesFull,
          add: (d, newId, at) => addProcess(d, { id: newId(), op: structuredClone(DEFAULT_OPS[kind]) as ProcessOp, board: downstream(at), input: layer }),
        }),
      ),
      {
        label: 'New main preview',
        separated: !nest,
        disabled: compsFull,
        add: (d, newId, at) => {
          const id = newId();
          return chain(addComposition(d, { id, label: `Main preview ${d.compositions.length + 1}`, board: downstream(at) }), (n) => connectSource(n, layer, undefined, id));
        },
      },
    ];
  }

  if (handleType === 'source' && composition && handleId === OUTPUT_HANDLE) {
    // The default size first (as T10.4 did), then the first presets.
    const sizes = [{ name: label(NEW_OUTPUT_SIZE), settings: { size: { ...NEW_OUTPUT_SIZE }, ...outputDefaults('px') } }, ...presets.slice(0, 8).map((p) => ({ name: p.name, settings: { ...presetSettings(p), size: { ...p.size } } }))];
    return sizes.map((s, i) => ({
      label: i === 0 ? `Output ${s.name}` : s.name,
      separated: i === 1,
      disabled: outputsFull,
      add: (d, newId, at) => addOutput(d, { id: newId(), label: s.name, ...s.settings, composition, board: downstream(at) }),
    }));
  }

  if (handleType === 'target' && (composition || process || (output && handleId))) {
    const wire = (d: ProjectDoc, sourceId: string): SourceResult => {
      if (composition) return connectSource(d, sourceId, portFromHandle(handleId), composition);
      if (process) return connectProcessInput(d, process, sourceId);
      return connectOutputLayer(d, output as string, sourceId, portFromHandle(handleId));
    };
    return INPUTS.map((i) => ({
      label: i.label,
      disabled: inputsFull,
      add: (d, newId, at) => {
        const id = newId();
        return chain(addSource(d, { id, ...i.input, board: upstream(at) }), (n) => wire(n, id));
      },
    }));
  }

  if (handleType === 'target' && output && !handleId && !isOutputConnected(doc, output)) {
    return [
      {
        label: 'New main preview',
        disabled: compsFull,
        add: (d, newId, at) => {
          const id = newId();
          return chain(addComposition(d, { id, label: `Main preview ${d.compositions.length + 1}`, board: upstream(at) }), (n) => reconnectOutput(n, output, 'keep', id));
        },
      },
    ];
  }
  return [];
}

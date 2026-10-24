/**
 * Output-node operations on a ProjectDoc (pure; ids are passed in). Flow 4: a new output appears wired to
 * main (or to the composition given). Outputs store only their settings and overrides; their layout is always
 * computed (D18).
 */
import { compositionById, edgeId, MAIN, mainComposition, outputComposition } from './graph';
import { DEFAULTS, LIMITS, type OutputNode, type ProjectDoc, type Size } from './model';
import { computeLayout, type LayoutDeps, type LayoutResult } from './layout';
import type { RenderScene } from './render';
import type { SourceResult } from './sources';

export const OUTPUT_COLUMN_X = 420;
export const OUTPUT_ROW_GAP = 480;
export const EXPORT_SCALE_RANGE = { min: 1, max: 4 } as const;
export const DPI_RANGE = { min: 72, max: 1200 } as const;
export const BLEED_MM_MAX = 50;

/** composition→output edge id; the output is "connected" iff this edge exists. */
export const outputWireId = (outputId: string) => edgeId(MAIN, outputId, 'composition');

export type OutputSettings = Partial<Pick<OutputNode, 'label' | 'presetId' | 'size' | 'dpi' | 'exportScale' | 'bleedMm' | 'safeMarginPct'>>;

const inRange = (v: number | undefined, min: number, max: number) => v === undefined || (Number.isFinite(v) && v >= min && v <= max);
const validSize = (s: Size) => (s.unit === 'px' || s.unit === 'mm') && [s.width, s.height].every((v) => Number.isFinite(v) && v > 0 && v <= 100_000);

function valid(o: OutputNode): boolean {
  return (
    validSize(o.size) &&
    inRange(o.exportScale, EXPORT_SCALE_RANGE.min, EXPORT_SCALE_RANGE.max) &&
    inRange(o.dpi, DPI_RANGE.min, DPI_RANGE.max) &&
    inRange(o.bleedMm, 0, BLEED_MM_MAX) &&
    inRange(o.safeMarginPct, 0, 25) &&
    o.label.trim().length > 0
  );
}

export function canAddOutput(doc: ProjectDoc): boolean {
  return doc.outputs.length < LIMITS.maxOutputs;
}

/** Adds an output wired to a composition (main by default), in the column right of it (or at `board`, T8.4). */
export function addOutput(
  doc: ProjectDoc,
  { board, composition = MAIN, ...spec }: { id: string; label: string; size: Size; board?: { x: number; y: number }; composition?: string } & OutputSettings,
): SourceResult {
  if (!canAddOutput(doc)) return { ok: false, error: 'output_limit' };
  if (doc.outputs.some((o) => o.id === spec.id)) return { ok: false, error: 'invalid' };
  const comp = compositionById(doc, composition);
  if (!comp) return { ok: false, error: 'not_found' };
  const main = mainComposition(doc);
  const lowest = doc.outputs.reduce((y, o) => Math.max(y, o.board.y + OUTPUT_ROW_GAP), main.board.y);
  const output: OutputNode = {
    ...spec,
    label: spec.label.trim(),
    size: { ...spec.size },
    overrides: [],
    board: board
      ? { x: Math.round(board.x), y: Math.round(board.y) }
      : { x: main.board.x + OUTPUT_COLUMN_X, y: doc.outputs.length === 0 ? main.board.y : lowest },
  };
  if (!valid(output)) return { ok: false, error: 'invalid' };
  return {
    ok: true,
    doc: { ...doc, outputs: [...doc.outputs, output], edges: [...doc.edges, { id: edgeId(comp.id, spec.id, 'composition'), from: comp.id, to: spec.id, kind: 'composition' }] },
  };
}

/** Changes an output's settings (size, unit, dpi, scale, bleed, …). Overrides are kept. */
export function updateOutput(doc: ProjectDoc, id: string, patch: OutputSettings): SourceResult {
  const current = doc.outputs.find((o) => o.id === id);
  if (!current) return { ok: false, error: 'not_found' };
  const next: OutputNode = { ...current, ...patch, ...(patch.label !== undefined ? { label: patch.label.trim() } : {}) };
  if (!valid(next)) return { ok: false, error: 'invalid' };
  return { ok: true, doc: { ...doc, outputs: doc.outputs.map((o) => (o.id === id ? next : o)) } };
}

export function deleteOutput(doc: ProjectDoc, id: string): SourceResult {
  if (!doc.outputs.some((o) => o.id === id)) return { ok: false, error: 'not_found' };
  // D46: its Preset node row goes too.
  const presetSets = doc.presetSets?.map((set) => (set.outputs.includes(id) ? { ...set, outputs: set.outputs.filter((o) => o !== id) } : set));
  return { ok: true, doc: { ...doc, outputs: doc.outputs.filter((o) => o.id !== id), edges: doc.edges.filter((e) => e.to !== id && e.from !== id), ...(presetSets ? { presetSets } : {}) } };
}

/**
 * What the OutputRenderer draws for an output: its full canvas (incl. bleed) and the engine's items,
 * with each text layer's style override (when `output` is given) so colour, font and alignment follow it.
 */
export function outputScene(layout: LayoutResult, output?: Pick<OutputNode, 'overrides'>): RenderScene {
  const styles = new Map(output?.overrides.filter((o) => o.style).map((o) => [o.sourceId, o.style]));
  return {
    width: layout.metrics.full.w,
    height: layout.metrics.full.h,
    items: layout.items.map(({ sourceId, frame, fontSizePx, lines, assetId }) => {
      const style = styles.get(sourceId);
      return {
        sourceId,
        frame,
        ...(fontSizePx !== undefined ? { fontSizePx } : {}),
        ...(lines ? { lines } : {}),
        ...(style ? { style } : {}),
        ...(assetId ? { assetId } : {}),
      };
    }),
  };
}

/** Defaults for a new output of a unit: print outputs get 300 dpi + 3 mm bleed, screen outputs 1×. */
export function outputDefaults(unit: Size['unit']): OutputSettings {
  return unit === 'mm' ? { dpi: DEFAULTS.printDpi, bleedMm: DEFAULTS.printBleedMm } : { exportScale: 1 };
}

export function isOutputConnected(doc: ProjectDoc, outputId: string): boolean {
  return outputComposition(doc, outputId) !== undefined;
}

/**
 * Disconnect (D12/D20): removes the composition→output edge and stores `frozen` = the frames (and font sizes)
 * the engine computes right now, before overrides. Overrides stay and keep applying on top.
 */
export function disconnectOutput(doc: ProjectDoc, outputId: string, deps: LayoutDeps): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) return { ok: false, error: 'not_found' };
  if (!isOutputConnected(doc, outputId)) return { ok: true, doc };
  const auto = computeLayout({ ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides: [], frozen: undefined } : o)) }, outputId, deps);
  const frozen = { items: auto.items.map(({ sourceId, frame, fontSizePx }) => ({ sourceId, frame, ...(fontSizePx !== undefined ? { fontSizePx } : {}) })) };
  return {
    ok: true,
    doc: {
      ...doc,
      outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, frozen } : o)),
      edges: doc.edges.filter((e) => !(e.kind === 'composition' && e.to === outputId)),
    },
  };
}

/** What reconnecting needs (D21): silent re-sync without overrides, otherwise ask keep / reset all / cancel. */
export function reconnectNeedsChoice(doc: ProjectDoc, outputId: string): boolean {
  return (doc.outputs.find((o) => o.id === outputId)?.overrides.length ?? 0) > 0;
}

/**
 * Reconnect: wires the output to a composition (main by default; an output has one) and deletes `frozen`;
 * 'reset' also clears every override of the output.
 */
export function reconnectOutput(doc: ProjectDoc, outputId: string, overrides: 'keep' | 'reset', composition: string = MAIN): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output || !compositionById(doc, composition)) return { ok: false, error: 'not_found' };
  const { frozen: _frozen, ...rest } = output;
  void _frozen;
  const next: OutputNode = { ...rest, overrides: overrides === 'reset' ? [] : output.overrides };
  return {
    ok: true,
    doc: {
      ...doc,
      outputs: doc.outputs.map((o) => (o.id === outputId ? next : o)),
      edges: [
        ...doc.edges.filter((e) => !(e.kind === 'composition' && e.to === outputId)),
        { id: edgeId(composition, outputId, 'composition'), from: composition, to: outputId, kind: 'composition' },
      ],
    },
  };
}

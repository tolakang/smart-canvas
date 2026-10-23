/**
 * Preset nodes (D46, PDF page 3 "GDN Preset Node"): one node lists many output sizes (e.g. the 7 GDN sizes),
 * fed by one wire from a master preview. Each size is an ordinary output — its own layout (guides, D42),
 * overrides and export — shown as its Preview node, wired from its row. Pure; ids are passed in.
 */
import { compositionById, edgeId, MAIN } from './graph';
import type { PresetSet, ProjectDoc, Size } from './model';
import { addOutput, deleteOutput, type OutputSettings } from './outputs';
import type { SourceResult } from './sources';

/** The sets with only outputs that still exist. */
export function presetSets(doc: ProjectDoc): PresetSet[] {
  const ids = new Set(doc.outputs.map((o) => o.id));
  return (doc.presetSets ?? []).map((s) => (s.outputs.every((o) => ids.has(o)) ? s : { ...s, outputs: s.outputs.filter((o) => ids.has(o)) }));
}

/** The set an output is a row of, if any. */
export const setOf = (doc: ProjectDoc, outputId: string): PresetSet | undefined => presetSets(doc).find((s) => s.outputs.includes(outputId));

const withSets = (doc: ProjectDoc, sets: PresetSet[]): ProjectDoc => {
  const next = { ...doc };
  if (sets.length) next.presetSets = sets;
  else delete next.presetSets;
  return next;
};

/** Where a set's previews go on the board: a column to its right, one per row. */
export const PREVIEW_OFFSET = { x: 420, rowGap: 380 };

/**
 * Adds a Preset node with its sizes: each becomes an output wired to `composition` (the master preview by
 * default), its Preview placed in a column right of the node. One result, so one undo step.
 */
export function addPresetSet(
  doc: ProjectDoc,
  spec: { id: string; label: string; board: { x: number; y: number }; sizes: readonly ({ id: string; label: string; size: Size } & OutputSettings)[]; composition?: string },
): SourceResult {
  if ((doc.presetSets ?? []).some((s) => s.id === spec.id) || doc.outputs.some((o) => o.id === spec.id)) return { ok: false, error: 'invalid' };
  const composition = spec.composition ?? MAIN;
  if (!compositionById(doc, composition)) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const [i, s] of spec.sizes.entries()) {
    const r = addOutput(next, { ...s, composition, board: { x: spec.board.x + PREVIEW_OFFSET.x, y: spec.board.y + i * PREVIEW_OFFSET.rowGap } });
    if (!r.ok) return r;
    next = r.doc;
  }
  const set: PresetSet = { id: spec.id, label: spec.label.trim() || 'Preset', board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) }, outputs: spec.sizes.map((s) => s.id) };
  return { ok: true, doc: withSets(next, [...presetSets(next), set]) };
}

const editSet = (doc: ProjectDoc, id: string, edit: (s: PresetSet) => PresetSet): SourceResult => {
  const sets = presetSets(doc);
  if (!sets.some((s) => s.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withSets(doc, sets.map((s) => (s.id === id ? edit(s) : s))) };
};

/** The master preview a set follows: the one wired to its first connected output (none: the master). */
export function setComposition(doc: ProjectDoc, setId: string): string {
  const set = presetSets(doc).find((s) => s.id === setId);
  const wired = set?.outputs.map((o) => doc.edges.find((e) => e.kind === 'composition' && e.to === o)?.from).find(Boolean);
  return wired ?? MAIN;
}

/** Adds a size to a set (a new output following the set's master preview), as its last row. */
export function addSizeToSet(doc: ProjectDoc, setId: string, size: { id: string; label: string; size: Size } & OutputSettings): SourceResult {
  const set = presetSets(doc).find((s) => s.id === setId);
  if (!set) return { ok: false, error: 'not_found' };
  const r = addOutput(doc, { ...size, composition: setComposition(doc, setId), board: { x: set.board.x + PREVIEW_OFFSET.x, y: set.board.y + set.outputs.length * PREVIEW_OFFSET.rowGap } });
  return r.ok ? editSet(r.doc, setId, (s) => ({ ...s, outputs: [...s.outputs, size.id] })) : r;
}

/** D51: shows / hides a size's Preview on the board (the size still lays out and exports). */
export function setPreviewHidden(doc: ProjectDoc, setId: string, outputId: string, hidden: boolean): SourceResult {
  return editSet(doc, setId, (s) => {
    if (!s.outputs.includes(outputId)) return s;
    const rest = (s.hidden ?? []).filter((o) => o !== outputId);
    const next = hidden ? [...rest, outputId] : rest;
    const { hidden: _old, ...base } = s;
    void _old;
    return next.length ? { ...base, hidden: next } : base;
  });
}

/** Moves a row within its set (row order only). */
export function moveSetRow(doc: ProjectDoc, setId: string, outputId: string, to: number): SourceResult {
  return editSet(doc, setId, (s) => {
    const outputs = s.outputs.filter((o) => o !== outputId);
    if (outputs.length === s.outputs.length) return s;
    outputs.splice(Math.max(0, Math.min(to, outputs.length)), 0, outputId);
    return { ...s, outputs };
  });
}

export function renameSet(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return editSet(doc, id, (s) => (clean ? { ...s, label: clean } : s));
}

/** Wires every size of a set to a master preview (a wire dragged onto the Preset node). Frozen ones reconnect. */
export function connectSet(doc: ProjectDoc, setId: string, composition: string): SourceResult {
  const set = presetSets(doc).find((s) => s.id === setId);
  if (!set || !compositionById(doc, composition)) return { ok: false, error: 'not_found' };
  const members = new Set(set.outputs);
  const edges = [
    ...doc.edges.filter((e) => !(e.kind === 'composition' && members.has(e.to))),
    ...set.outputs.map((o) => ({ id: edgeId(composition, o, 'composition'), from: composition, to: o, kind: 'composition' as const })),
  ];
  const outputs = doc.outputs.map((o) => (members.has(o.id) && o.frozen ? (({ frozen: _f, ...rest }) => (void _f, rest))(o) : o));
  return { ok: true, doc: { ...doc, edges, outputs } };
}

/** Deletes a Preset node with all its sizes. */
export function deletePresetSet(doc: ProjectDoc, id: string): SourceResult {
  const set = presetSets(doc).find((s) => s.id === id);
  if (!set) return { ok: false, error: 'not_found' };
  let next = doc;
  for (const o of set.outputs) {
    const r = deleteOutput(next, o);
    if (r.ok) next = r.doc;
  }
  return { ok: true, doc: withSets(next, presetSets(next).filter((s) => s.id !== id)) };
}

/** Preset families from preset names: "GDN 300×250" → GDN. A family with sizes becomes a Preset node's list. */
export function presetFamilies<T extends { name: string }>(presets: readonly T[]): { label: string; presets: T[] }[] {
  const families = new Map<string, T[]>();
  for (const p of presets) {
    const label = /^(.*?)\s+\d+\s*[×x]\s*\d+$/.exec(p.name)?.[1]?.trim();
    if (!label) continue;
    families.set(label, [...(families.get(label) ?? []), p]);
  }
  return [...families].map(([label, list]) => ({ label, presets: list }));
}

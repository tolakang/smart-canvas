/**
 * Output overrides (D19): per (output, source) partial frame / text style / hidden. They are the only
 * stored layout state; the engine applies them last, and master edits never touch them (D20).
 */
import { computeLayout, type LayoutDeps } from './layout';
import { cleanShear, type Frame, type Override, type OutputNode, type ProjectDoc, type TextStyle } from './model';
import type { SourceResult } from './sources';
import { applyTextStylePatch, type TextStylePatch } from './text-style';
import { isLayerNode, layerSource } from './layers';

/** Who and when, stamped on every override write. */
export interface OverrideAuthor {
  by: string;
  at: string; // ISO
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function withOverride(
  doc: ProjectDoc,
  outputId: string,
  sourceId: string,
  author: OverrideAuthor,
  edit: (current: Override | undefined, output: OutputNode) => Override | null,
): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) return { ok: false, error: 'not_found' };
  if (!isLayerNode(doc, sourceId)) return { ok: false, error: 'not_found' };
  const current = output.overrides.find((o) => o.sourceId === sourceId);
  const next = edit(current, output);
  const rest = output.overrides.filter((o) => o.sourceId !== sourceId);
  const overrides = next ? [...rest, { ...next, sourceId, updatedBy: author.by, updatedAt: author.at }] : rest;
  return { ok: true, doc: { ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides } : o)) } };
}

/** Moves / resizes / rotates / shears a layer on one output (design px of that output's canvas; rotation and shear in degrees). */
export function setOverrideFrame(doc: ProjectDoc, outputId: string, sourceId: string, frame: Partial<Frame>, author: OverrideAuthor): SourceResult {
  const clean: Partial<Frame> = {};
  for (const key of ['x', 'y', 'w', 'h', 'rotation', 'shear'] as const) {
    const v = frame[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    clean[key] = key === 'w' || key === 'h' ? Math.max(round(v), 1) : key === 'rotation' ? round(((v % 360) + 360) % 360) : key === 'shear' ? cleanShear(v) : round(v);
  }
  // D37: a frame edited from a fitted one stays fitted (the picture keeps filling it).
  if (frame.fitted) clean.fitted = true;
  return withOverride(doc, outputId, sourceId, author, (cur) => ({
    ...(cur ?? { sourceId, updatedBy: author.by, updatedAt: author.at }),
    frame: { ...cur?.frame, ...clean },
  }));
}

/**
 * Restyles a text layer on one output. Values are validated like the master text panel; a field equal to
 * the source's own style is dropped, so the override keeps only what really differs. Setting fontSizePx
 * turns auto-fit off for that layer (ADAPTATION-RULES rule 8).
 */
export function setOverrideStyle(doc: ProjectDoc, outputId: string, sourceId: string, patch: TextStylePatch, author: OverrideAuthor): SourceResult {
  const source = layerSource(doc, sourceId);
  if (source && source.content.kind !== 'text') return { ok: false, error: 'bad_behavior' };
  return withOverride(doc, outputId, sourceId, author, (cur) => {
    if (!source || source.content.kind !== 'text') return cur ?? null;
    const base = source.content.style;
    const merged = applyTextStylePatch({ ...base, ...cur?.style }, patch);
    const style: Partial<TextStyle> = {};
    for (const key of Object.keys(merged) as (keyof TextStyle)[]) {
      if (merged[key] !== base[key]) (style as Record<string, unknown>)[key] = merged[key];
    }
    if (patch.lineHeight === null) delete style.lineHeight;
    const next: Override = { ...(cur ?? { sourceId, updatedBy: author.by, updatedAt: author.at }), style };
    if (Object.keys(style).length === 0) delete next.style;
    return next.frame || next.style || next.hidden ? next : null;
  });
}

/** Hides or shows a layer on one output only. */
export function setOverrideHidden(doc: ProjectDoc, outputId: string, sourceId: string, hidden: boolean, author: OverrideAuthor): SourceResult {
  return withOverride(doc, outputId, sourceId, author, (cur) => {
    const next: Override = { ...(cur ?? { sourceId, updatedBy: author.by, updatedAt: author.at }) };
    if (hidden) next.hidden = true;
    else delete next.hidden;
    return next.frame || next.style || next.hidden ? next : null;
  });
}

/** One overridden field and what the automatic layout would give (T5.2 inspector). */
export interface OverrideField {
  field: string; // 'x' | 'y' | 'w' | 'h' | 'rotation' | 'shear' | 'hidden' | a TextStyle key
  auto: string | number | boolean | undefined;
  value: string | number | boolean | undefined;
}

/**
 * The fields of a layer's override on one output that differ from auto. Auto = the engine's result for
 * this output without this override (frozen frames included); text style auto = the source's own style,
 * except font size, whose auto is the fitted size.
 */
export function overrideDiff(doc: ProjectDoc, outputId: string, sourceId: string, deps: LayoutDeps): OverrideField[] {
  const output = doc.outputs.find((o) => o.id === outputId);
  const override = output?.overrides.find((o) => o.sourceId === sourceId);
  const source = layerSource(doc, sourceId);
  if (!output || !override || !source) return [];
  const without = { ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides: o.overrides.filter((x) => x.sourceId !== sourceId) } : o)) };
  const auto = computeLayout(without, outputId, deps).items.find((i) => i.sourceId === sourceId);
  const fields: OverrideField[] = [];
  if (override.hidden) fields.push({ field: 'hidden', auto: false, value: true });
  for (const key of ['x', 'y', 'w', 'h', 'rotation', 'shear'] as const) {
    const value = override.frame?.[key];
    if (value === undefined) continue;
    const a = key === 'rotation' || key === 'shear' ? (auto?.frame[key] ?? 0) : auto?.frame[key];
    if (a === undefined || Math.abs(a - value) > 1e-3) fields.push({ field: key, auto: a === undefined ? undefined : round(a), value });
  }
  if (override.style && source.content.kind === 'text') {
    const base = source.content.style;
    for (const [key, value] of Object.entries(override.style) as [keyof TextStyle, TextStyle[keyof TextStyle]][]) {
      const a = key === 'fontSizePx' ? auto?.fontSizePx : base[key];
      if (a !== value) fields.push({ field: key, auto: a, value });
    }
  }
  return fields;
}

/** "Reset layer" (D19): removes that layer's override on one output; its layout is auto again. */
export function resetOverride(doc: ProjectDoc, outputId: string, sourceId: string): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) return { ok: false, error: 'not_found' };
  if (!output.overrides.some((o) => o.sourceId === sourceId)) return { ok: true, doc };
  const overrides = output.overrides.filter((o) => o.sourceId !== sourceId);
  return { ok: true, doc: { ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides } : o)) } };
}

/** "Reset output" (D19): clears every override of one output. */
export function resetOutputOverrides(doc: ProjectDoc, outputId: string): SourceResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) return { ok: false, error: 'not_found' };
  if (output.overrides.length === 0) return { ok: true, doc };
  return { ok: true, doc: { ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides: [] } : o)) } };
}

/**
 * Output overrides (D19): per (output, source) partial frame / text style / hidden. They are the only
 * stored layout state; the engine applies them last, and master edits never touch them (D20).
 */
import type { Frame, Override, OutputNode, ProjectDoc, TextStyle } from './model';
import type { SourceResult } from './sources';
import { applyTextStylePatch, type TextStylePatch } from './text-style';

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
  if (!doc.sources.some((s) => s.id === sourceId)) return { ok: false, error: 'not_found' };
  const current = output.overrides.find((o) => o.sourceId === sourceId);
  const next = edit(current, output);
  const rest = output.overrides.filter((o) => o.sourceId !== sourceId);
  const overrides = next ? [...rest, { ...next, sourceId, updatedBy: author.by, updatedAt: author.at }] : rest;
  return { ok: true, doc: { ...doc, outputs: doc.outputs.map((o) => (o.id === outputId ? { ...o, overrides } : o)) } };
}

/** Moves / resizes / rotates a layer on one output (design px of that output's canvas, rotation in degrees). */
export function setOverrideFrame(doc: ProjectDoc, outputId: string, sourceId: string, frame: Partial<Frame>, author: OverrideAuthor): SourceResult {
  const clean: Partial<Frame> = {};
  for (const key of ['x', 'y', 'w', 'h', 'rotation'] as const) {
    const v = frame[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    clean[key] = key === 'w' || key === 'h' ? Math.max(round(v), 1) : key === 'rotation' ? round(((v % 360) + 360) % 360) : round(v);
  }
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
  const source = doc.sources.find((s) => s.id === sourceId);
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

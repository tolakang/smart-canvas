/**
 * Pure edits on input-source content (used by the input node editors).
 * Gradient angle convention and CSS output: fillToCss in @smart-canvas/core (shared with the renderer).
 */
import type { Fill, InputSource, ProjectDoc } from '@smart-canvas/core';

type LinearFill = Extract<Fill, { type: 'linear' }>;
type Stop = LinearFill['stops'][number];

/** New doc with one source replaced; unknown ids leave the doc unchanged. */
export function withSource(doc: ProjectDoc, id: string, edit: (s: InputSource) => InputSource): ProjectDoc {
  let changed = false;
  const sources = doc.sources.map((s) => {
    if (s.id !== id) return s;
    changed = true;
    return edit(s);
  });
  return changed ? { ...doc, sources } : doc;
}

export function setText(s: InputSource, text: string): InputSource {
  return s.content.kind === 'text' ? { ...s, content: { ...s.content, text } } : s;
}

export function setAsset(s: InputSource, assetId: string | null): InputSource {
  return s.content.kind === 'image' || s.content.kind === 'vector' ? { ...s, content: { ...s.content, assetId } } : s;
}

/** D9: a fill background takes a photo — it becomes an image background (undo brings the fill back). */
export function photoBackground(s: InputSource, assetId: string): InputSource {
  if (s.content.kind !== 'fill' || s.behavesLike !== 'background') return s;
  return { ...s, kind: 'image', content: { kind: 'image', assetId, focal: { x: 0.5, y: 0.5 } } };
}

/**
 * D43: a background's vertical or horizontal picture (null clears it). A fill background takes it as its photo
 * too (D9), so it has a picture for square outputs as well.
 */
export function setVariant(s: InputSource, family: 'vertical' | 'horizontal', assetId: string | null): InputSource {
  const base = assetId && s.content.kind === 'fill' ? photoBackground(s, assetId) : s;
  if (base.content.kind !== 'image' && base.content.kind !== 'vector') return s;
  const variants = Object.fromEntries(Object.entries({ ...base.content.variants, [family]: assetId }).filter(([, v]) => v)) as { vertical?: string; horizontal?: string };
  const { variants: _old, ...rest } = base.content;
  void _old;
  return { ...base, content: Object.keys(variants).length ? { ...rest, variants } : rest };
}

/** D44: a picture input takes any picture file, becoming an image or a vector input to match it. */
export function setPicture(s: InputSource, assetId: string, kind: 'image' | 'vector'): InputSource {
  if (s.content.kind !== 'image' && s.content.kind !== 'vector') return s;
  return { ...s, kind, content: { ...s.content, kind, assetId } };
}

/** D9 the other way: an image background goes back to a solid colour. */
export function colourBackground(s: InputSource): InputSource {
  if (s.content.kind !== 'image' || s.behavesLike !== 'background') return s;
  return { ...s, kind: 'fill', content: { kind: 'fill', fill: { type: 'solid', color: '#ffffff' } } };
}

export function setFill(s: InputSource, fill: Fill): InputSource {
  return s.content.kind === 'fill' ? { ...s, content: { kind: 'fill', fill } } : s;
}

const sorted = (stops: Stop[]) => [...stops].sort((a, b) => a.offset - b.offset);

/** Switch solid ↔ linear, keeping the colour the user already picked. */
export function switchFillType(fill: Fill, type: Fill['type']): Fill {
  if (fill.type === type) return fill;
  if (type === 'solid') return { type: 'solid', color: fill.type === 'linear' ? (sorted(fill.stops)[0]?.color ?? '#ffffff') : '#ffffff' };
  const color = fill.type === 'solid' ? fill.color : '#ffffff';
  return { type: 'linear', angleDeg: 180, stops: [{ offset: 0, color }, { offset: 1, color: '#ffffff' }] };
}

export function setStop(fill: LinearFill, index: number, patch: Partial<Stop>): LinearFill {
  return {
    ...fill,
    stops: fill.stops.map((s, i) => (i === index ? { ...s, ...patch, offset: clamp01(patch.offset ?? s.offset) } : s)),
  };
}

/** Adds a stop in the middle of the widest gap, coloured like its left neighbour. */
export function addStop(fill: LinearFill): LinearFill {
  const st = sorted(fill.stops);
  let at = 0.5;
  let color = st[0]?.color ?? '#ffffff';
  let widest = -1;
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i];
    const b = st[i + 1];
    if (a && b && b.offset - a.offset > widest) {
      widest = b.offset - a.offset;
      at = (a.offset + b.offset) / 2;
      color = a.color;
    }
  }
  return { ...fill, stops: sorted([...fill.stops, { offset: Math.round(at * 1000) / 1000, color }]) };
}

/** A gradient keeps at least two stops. */
export function removeStop(fill: LinearFill, index: number): LinearFill {
  return fill.stops.length <= 2 ? fill : { ...fill, stops: fill.stops.filter((_, i) => i !== index) };
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

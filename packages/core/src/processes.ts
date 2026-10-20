/**
 * Process nodes (D32, T12.5, T12.6): a node that changes a layer without touching its input — Crop, Adjust,
 * Flip/Rotate, Text variant (replace text and/or style, e.g. a translation) and Recolor. A process has one `layer` in port and one `layer`
 * out port; chains are evaluated in order, the input first (NODE-GRAPH "Effective layer").
 *
 * Wherever a layer id is looked up (composition and output rows, placements, overrides, the renderer), a
 * process id stands for its effective layer: the chain's input with every op applied. `layerSources(doc)`
 * gives all of them — the inputs as they are, plus one per process whose chain reaches an input.
 */
import { edgeId } from './graph';
import { LIMITS, type Frame, type InputSource, type NFrame, type ProcessNode, type ProcessOp, type ProjectDoc, type SourceContent } from './model';
import type { SourceResult } from './sources';

/** An input, or a process standing for its effective layer. `effect`: the chain's ops folded into one. */
export interface LayerSource extends InputSource {
  effect?: LayerEffect;
}

/**
 * A chain of Crop / Adjust / Flip-Rotate ops folded into one canonical effect: crop the image (in its own
 * 0..1 coordinates), then mirror it horizontally (`flipX`), then rotate it clockwise (`rotate`); colour
 * adjustments multiply (blur adds).
 */
export interface LayerEffect {
  crop?: NFrame;
  flipX: boolean;
  rotate: 0 | 90 | 180 | 270;
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blurPx: number;
  /** Recolor on a picture (T12.6): drawn as a one-colour silhouette of its shape (CSS mask). */
  tint?: string;
}

export const NO_EFFECT: LayerEffect = { flipX: false, rotate: 0, opacity: 1, brightness: 1, contrast: 1, saturation: 1, blurPx: 0 };

const deg = (r: number) => ((((Math.round(r / 90) * 90) % 360) + 360) % 360) as LayerEffect['rotate'];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A crop rect given in the current (cropped, flipped, rotated) view, mapped back to the image's own coordinates. */
function cropToImage(r: NFrame, e: LayerEffect): NFrame {
  // Undo the rotation (the view is the pre-rotation image turned clockwise by e.rotate).
  let { x, y, w, h } = r;
  if (e.rotate === 90) ({ x, y, w, h } = { x: y, y: 1 - (x + w), w: h, h: w });
  else if (e.rotate === 180) ({ x, y } = { x: 1 - (x + w), y: 1 - (y + h) });
  else if (e.rotate === 270) ({ x, y, w, h } = { x: 1 - (y + h), y: x, w: h, h: w });
  if (e.flipX) x = 1 - (x + w);
  const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return { x: c.x + x * c.w, y: c.y + y * c.h, w: w * c.w, h: h * c.h };
}

/** Applies one op (in chain order) to an effect. */
export function applyOp(e: LayerEffect, op: ProcessOp): LayerEffect {
  switch (op.type) {
    case 'crop': {
      const x = clamp01(op.rect.x);
      const y = clamp01(op.rect.y);
      const r = { x, y, w: Math.max(0.01, Math.min(op.rect.w, 1 - x)), h: Math.max(0.01, Math.min(op.rect.h, 1 - y)) };
      return { ...e, crop: cropToImage(r, e) };
    }
    case 'flip': {
      let { flipX, rotate } = e;
      // Mirroring after a rotation r equals rotating by −r after mirroring; a vertical flip is a horizontal one turned 180°.
      if (op.x) ({ flipX, rotate } = { flipX: !flipX, rotate: deg(-rotate) });
      if (op.y) ({ flipX, rotate } = { flipX: !flipX, rotate: deg(180 - rotate) });
      return { ...e, flipX, rotate: deg(rotate + (op.rotate ?? 0)) };
    }
    case 'adjust':
      return {
        ...e,
        opacity: e.opacity * clamp01(op.opacity ?? 1),
        brightness: e.brightness * Math.max(0, op.brightness ?? 1),
        contrast: e.contrast * Math.max(0, op.contrast ?? 1),
        saturation: e.saturation * Math.max(0, op.saturation ?? 1),
        blurPx: e.blurPx + Math.max(0, op.blurPx ?? 0),
      };
    case 'recolor':
      return { ...e, tint: op.color };
    default:
      return e;
  }
}

/**
 * Content-changing ops (T12.6), in chain order: a Text variant replaces the text (when given) and merges its
 * style; Recolor makes a fill solid and sets a text's colour (pictures get `tint` on the effect instead).
 */
export function applyContentOp(c: SourceContent, op: ProcessOp): SourceContent {
  if (op.type === 'textVariant' && c.kind === 'text')
    return { ...c, ...(op.text !== undefined && op.text !== '' ? { text: op.text } : {}), style: { ...c.style, ...op.style } };
  if (op.type === 'recolor') {
    if (c.kind === 'fill') return { ...c, fill: { type: 'solid', color: op.color } };
    if (c.kind === 'text') return { ...c, style: { ...c.style, color: op.color } };
  }
  return c;
}

export function isNoEffect(e: LayerEffect | undefined): boolean {
  return !e || (!e.crop && !e.flipX && e.rotate === 0 && e.opacity === 1 && e.brightness === 1 && e.contrast === 1 && e.saturation === 1 && e.blurPx === 0 && !e.tint);
}

/** The node feeding a process's in port, if wired. */
export function processInput(doc: ProjectDoc, processId: string): string | undefined {
  return doc.edges.find((e) => e.kind === 'layer' && e.to === processId)?.from;
}

/** A process's effective layer: its chain's input with every op applied, or undefined if the chain doesn't reach an input. */
export function resolveProcess(doc: ProjectDoc, processId: string): LayerSource | undefined {
  const chain: ProcessNode[] = [];
  const seen = new Set<string>();
  let id: string | undefined = processId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const p = doc.processes.find((x) => x.id === id);
    if (!p) break;
    chain.unshift(p);
    id = processInput(doc, p.id);
  }
  const input = id ? doc.sources.find((s) => s.id === id) : undefined;
  const self = chain.at(-1);
  if (!input || !self || self.id !== processId) return undefined;
  const picture = input.content.kind === 'image' || input.content.kind === 'vector';
  const effect = chain.reduce((e, p) => (p.op.type === 'recolor' && !picture ? e : applyOp(e, p.op)), NO_EFFECT);
  const content = chain.reduce((c, p) => applyContentOp(c, p.op), input.content);
  return { ...input, id: self.id, label: self.label, board: self.board, content, ...(isNoEffect(effect) ? {} : { effect }) };
}

/** Every layer a row can show: the inputs, plus each process whose chain reaches an input. */
export function layerSources(doc: ProjectDoc): LayerSource[] {
  return [...doc.sources, ...doc.processes.flatMap((p) => resolveProcess(doc, p.id) ?? [])];
}

export function layerSource(doc: ProjectDoc, id: string): LayerSource | undefined {
  return doc.sources.find((s) => s.id === id) ?? (doc.processes.some((p) => p.id === id) ? resolveProcess(doc, id) : undefined);
}

/** Can `id` be a row (an input or a process)? */
export function isLayerNode(doc: ProjectDoc, id: string): boolean {
  return doc.sources.some((s) => s.id === id) || doc.processes.some((p) => p.id === id);
}

/**
 * Intrinsic size of a layer's picture after its effect (crop, then a quarter turn swaps the sides), from the
 * asset sizes the layout and renderer already have. Undefined when unknown (no file, or not loaded).
 */
export function layerAssetSize(layer: InputSource & { effect?: LayerEffect }, assets: Record<string, { width: number; height: number }>): { width: number; height: number } | undefined {
  const c = layer.content;
  const size = (c.kind === 'image' || c.kind === 'vector') && c.assetId ? assets[c.assetId] : undefined;
  if (!size || !(size.width > 0 && size.height > 0)) return undefined;
  const crop = layer.effect?.crop;
  const w = size.width * (crop?.w ?? 1);
  const h = size.height * (crop?.h ?? 1);
  return layer.effect && layer.effect.rotate % 180 !== 0 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Where to draw the picture inside a layer's frame (frame-local design px): the visible (cropped, turned)
 * picture is fitted — `cover` for backgrounds around the focal point, `contain` otherwise — and the full image
 * is placed so that its crop lands there. Pure geometry shared by the renderer and its tests.
 */
export function effectBoxes(frame: Pick<Frame, 'w' | 'h'>, image: { width: number; height: number }, effect: LayerEffect, cover: boolean, focal = { x: 0.5, y: 0.5 }) {
  const crop = effect.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = image.width * crop.w;
  const ch = image.height * crop.h;
  const quarter = effect.rotate % 180 !== 0;
  const vw0 = quarter ? ch : cw;
  const vh0 = quarter ? cw : ch;
  const s = cover ? Math.max(frame.w / vw0, frame.h / vh0) : Math.min(frame.w / vw0, frame.h / vh0);
  const view = { w: vw0 * s, h: vh0 * s };
  const fx = cover ? focal.x : 0.5;
  const fy = cover ? focal.y : 0.5;
  const viewAt = { x: (frame.w - view.w) * fx, y: (frame.h - view.h) * fy };
  // The un-rotated crop window, centred in the view, then turned and mirrored.
  const pane = { w: quarter ? view.h : view.w, h: quarter ? view.w : view.h };
  const paneAt = { x: (view.w - pane.w) / 2, y: (view.h - pane.h) / 2 };
  const k = pane.w / cw;
  const img = { x: -crop.x * image.width * k, y: -crop.y * image.height * k, w: image.width * k, h: image.height * k };
  return { view: { ...viewAt, ...view }, pane: { ...paneAt, ...pane }, img };
}

/** CSS filter for an effect's colour adjustments (undefined when none). */
export function effectFilter(e: LayerEffect): string | undefined {
  const parts = [
    e.brightness !== 1 ? `brightness(${round(e.brightness)})` : '',
    e.contrast !== 1 ? `contrast(${round(e.contrast)})` : '',
    e.saturation !== 1 ? `saturate(${round(e.saturation)})` : '',
    e.blurPx > 0 ? `blur(${round(e.blurPx)}px)` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

// ---------- editing ----------

export const DEFAULT_OPS: Record<ProcessOp['type'], ProcessOp> = {
  crop: { type: 'crop', rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
  adjust: { type: 'adjust', opacity: 1, brightness: 1, contrast: 1, saturation: 1, blurPx: 0 },
  flip: { type: 'flip', x: true, y: false, rotate: 0 },
  textVariant: { type: 'textVariant', text: '', style: {} },
  recolor: { type: 'recolor', color: '#ffffff' },
};

export const PROCESS_LABEL: Record<ProcessOp['type'], string> = { crop: 'Crop', adjust: 'Adjust', flip: 'Flip / Rotate', textVariant: 'Text variant', recolor: 'Recolor' };

const HEX = /^#[0-9a-f]{6}$/i;
/** An op the renderer can draw: colours are #rrggbb, a text variant is at most 2000 characters. */
export function validOp(op: ProcessOp): boolean {
  if (op.type === 'recolor') return HEX.test(op.color);
  if (op.type === 'textVariant') return (op.text ?? '').length <= 2000 && (op.style?.color === undefined || HEX.test(op.style.color)) && (op.style?.fontSizePx === undefined || (op.style.fontSizePx >= 4 && op.style.fontSizePx <= 2000));
  return true;
}

export function canAddProcess(doc: ProjectDoc): boolean {
  return doc.processes.length < LIMITS.maxProcesses;
}

const taken = (doc: ProjectDoc, id: string) =>
  doc.sources.some((s) => s.id === id) || doc.processes.some((p) => p.id === id) || doc.compositions.some((c) => c.id === id) || doc.outputs.some((o) => o.id === id);

/** Adds a process node; with `input`, its in port is wired from that input or process. */
export function addProcess(doc: ProjectDoc, spec: { id: string; op: ProcessOp; label?: string; board: { x: number; y: number }; input?: string }): SourceResult {
  if (!canAddProcess(doc)) return { ok: false, error: 'limit' };
  if (taken(doc, spec.id) || !validOp(spec.op)) return { ok: false, error: 'invalid' };
  const node: ProcessNode = { id: spec.id, label: spec.label?.trim() || PROCESS_LABEL[spec.op.type], op: spec.op, board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) } };
  const next = { ...doc, processes: [...doc.processes, node] };
  return spec.input ? connectProcessInput(next, spec.id, spec.input) : { ok: true, doc: next };
}

export function updateProcess(doc: ProjectDoc, id: string, patch: { op?: ProcessOp; label?: string }): SourceResult {
  const p = doc.processes.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'not_found' };
  if (patch.op && (patch.op.type !== p.op.type || !validOp(patch.op))) return { ok: false, error: 'invalid' };
  const label = patch.label?.trim();
  return { ok: true, doc: { ...doc, processes: doc.processes.map((x) => (x.id === id ? { ...x, ...(patch.op ? { op: patch.op } : {}), ...(label ? { label } : {}) } : x)) } };
}

/** Wires `from` (an input or another process) into a process's one in port, replacing what fed it. */
export function connectProcessInput(doc: ProjectDoc, processId: string, from: string): SourceResult {
  if (!doc.processes.some((p) => p.id === processId) || !isLayerNode(doc, from)) return { ok: false, error: 'not_found' };
  const edges = doc.edges.filter((e) => !(e.kind === 'layer' && e.to === processId));
  // No loops: walk downstream from the process.
  const down = new Set<string>([processId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) {
      if (!down.has(e.from) || down.has(e.to)) continue;
      down.add(e.to);
      grew = true;
    }
  }
  if (down.has(from)) return { ok: false, error: 'invalid' };
  return { ok: true, doc: { ...doc, edges: [...edges, { id: edgeId(from, processId, 'layer'), from, to: processId, kind: 'layer' }] } };
}

export function disconnectProcessInput(doc: ProjectDoc, processId: string): SourceResult {
  if (!doc.processes.some((p) => p.id === processId)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: { ...doc, edges: doc.edges.filter((e) => !(e.kind === 'layer' && e.to === processId)) } };
}

/** Deletes a process: its wires, its rows and placements, and overrides / frozen frames that named it. */
export function deleteProcess(doc: ProjectDoc, id: string): SourceResult {
  if (!doc.processes.some((p) => p.id === id)) return { ok: false, error: 'not_found' };
  return {
    ok: true,
    doc: {
      ...doc,
      processes: doc.processes.filter((p) => p.id !== id),
      compositions: doc.compositions.map((c) => ({
        ...c,
        layers: c.layers.filter((l) => l !== id),
        placements: Object.fromEntries(Object.entries(c.placements).filter(([k]) => k !== id)),
      })),
      edges: doc.edges.filter((e) => e.from !== id && e.to !== id),
      outputs: doc.outputs.map((o) => ({
        ...o,
        overrides: o.overrides.filter((ov) => ov.sourceId !== id),
        ...(o.layers ? { layers: o.layers.filter((l) => l !== id) } : {}),
        ...(o.frozen ? { frozen: { items: o.frozen.items.filter((it) => it.sourceId !== id) } } : {}),
      })),
    },
  };
}

/**
 * Artwork Adaptation — shared model (packages/core/src/model.ts).
 * Source of truth for types and unit math. Copy as-is.
 *
 * Storage: `ProjectDoc` is saved as one JSONB column on `projects` (with `rev` for optimistic locking).
 * Separate tables: users, teams, memberships, invites, sessions, assets, library_items, presets, export_jobs.
 * Layout results are NEVER stored; only overrides are (inside ProjectDoc.outputs[].overrides).
 */

export type Unit = 'px' | 'mm';
export type TeamRole = 'admin' | 'editor' | 'viewer';
export type SourceKind = 'image' | 'vector' | 'text' | 'fill';
export type Behavior = 'background' | 'subject' | 'text' | 'logo' | 'decoration';
export type LayoutFamily = 'auto' | 'stack' | 'side';
export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf';
export type PresetGroup = 'print' | 'social';

export const LIMITS = {
  maxSources: 500, // D39: no practical layer limit; a safety ceiling for the API only
  maxOutputs: 100, // D46: a preset set (GDN alone is 7 sizes) — was 10
  maxCompositions: 5,
  maxProcesses: 20,
  maxGroups: 20,
  maxUploadMB: 50,
  maxExportEdgePx: 12000,
} as const;

export const DEFAULTS = {
  masterSize: { width: 3000, height: 3000, unit: 'px' as Unit },
  safeMarginPct: 5, // of min(trim w, trim h)
  printBleedMm: 3,
  printDpi: 300,
  minFontPx: 12, // design px
  minLogoWidthPct: 8, // of min(trim w, trim h)
  fontStepPx: 0.5,
  sideFamilyMinRatio: 1.3, // w/h at or above → 'side' when family = 'auto'
} as const;

// ---------- geometry ----------
export interface Size { width: number; height: number; unit: Unit }
/**
 * Rect in design px. Origin = top-left of the owning canvas (outputs: top-left of the BLEED box).
 * About its centre the box is turned by `rotation` (deg, clockwise) and sheared by `shear` (deg, CSS skewX:
 * the left/right edges lean from perpendicular to the top edge), i.e. CSS `rotate(r) skewX(s)`.
 * `fitted` (pictures, D37): the frame hugs the picture's visible (non-transparent) pixels and the picture fills
 * it, stretching with it. Without it the whole picture is fitted inside the frame (contain), as before.
 */
export interface Frame { x: number; y: number; w: number; h: number; rotation?: number; shear?: number; fitted?: true }
/** Rect normalized 0..1 relative to the master canvas (rotation and shear in degrees, as Frame). */
export interface NFrame { x: number; y: number; w: number; h: number; rotation?: number; shear?: number; fitted?: true }
/**
 * An editor transform (D36) as saved with the project, so the box's reset history survives a reload.
 * `origin` is the layer's untransformed box in the scene's design px; `ops` are the gestures, oldest first.
 */
export interface TransformOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  shear: number;
}
export type TransformOp =
  | { type: 'scale'; kx: number; ky: number; pivot: { x: number; y: number } }
  | { type: 'shear'; axis: 'lr' | 'tb'; k: number; pivot: { x: number; y: number } }
  | { type: 'rotate'; deg: number }
  | { type: 'move'; dx: number; dy: number };
export interface TransformHistory {
  origin: TransformOrigin;
  ops: TransformOp[];
}
/** Saved editor histories for one scene (a composition or an output), in that scene's design px. */
export interface LayerTransforms {
  /** The scene's design-px size when saved; a size change invalidates the histories. */
  scene: { width: number; height: number };
  layers: Record<string, TransformHistory>;
}

/** Shear is kept within ±MAX_SHEAR_DEG so a box never collapses to a line. */
export const MAX_SHEAR_DEG = 75;
/** A stored shear: rounded, clamped to ±MAX_SHEAR_DEG; 0 (and junk) mean none. */
export function cleanShear(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0;
  return Math.round(Math.max(-MAX_SHEAR_DEG, Math.min(MAX_SHEAR_DEG, v)) * 1e6) / 1e6 || 0;
}

// ---------- content ----------
export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angleDeg: number; stops: { offset: number; color: string }[] };

export interface TextStyle {
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number; // on the master canvas, design px
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight?: number; // multiplier; default 1.2 latin, 1.6 khmer
  letterSpacingEm?: number;
  maxLines: number; // >= 1
  textTransform?: 'none' | 'uppercase';
  language?: 'auto' | 'km' | 'en';
}

export type SourceContent =
  | {
      kind: 'image' | 'vector';
      assetId: string | null;
      focal: { x: number; y: number }; // focal 0..1
      /** D43: other pictures for vertical / horizontal outputs (a background's two slots); `assetId` serves the rest. */
      variants?: { vertical?: string; horizontal?: string };
    }
  | { kind: 'text'; text: string; style: TextStyle }
  | { kind: 'fill'; fill: Fill };

export interface InputSource {
  id: string;
  label: string;
  kind: SourceKind;
  behavesLike: Behavior;
  visible: boolean;
  /** D50: locked — not picked, moved or deleted on the editors' canvas (all three layouts); unlock in the Layers panel. */
  locked?: true;
  content: SourceContent;
  libraryItemId?: string; // set when created from the team library
  board: { x: number; y: number }; // node position on the board
}

// ---------- compositions (master previews) and outputs ----------
/**
 * A composition ("Master preview", D32): an artboard whose rows are layers. `layers` lists the rows front
 * first (row index = port, D11); a row is drawn only while a `layer` edge feeds it. The first composition
 * is always id 'main'.
 */
export interface Composition {
  id: string;
  label: string;
  size: Size; // default DEFAULTS.masterSize
  placements: Record<string, NFrame>; // layer node id -> frame (text sources: this is the text box)
  layers: string[]; // node ids of its rows, front first
  /** Editor transform histories (D41): so double-click resets keep working after a reload. Absent = none. */
  transforms?: LayerTransforms;
  board: { x: number; y: number };
  /**
   * D42: a layout guide of another composition (`of`, its master): its own artboard of that shape. An output
   * of the master takes its layout from whichever of the master and its guides is closest to its shape.
   */
  guide?: { of: string; family: GuideFamily };
}

/** D42: the three layout guide shapes. */
export type GuideFamily = 'square' | 'vertical' | 'horizontal';

/** Process nodes (D32, T12.5+): change a layer on its way to a composition or output. */
export type ProcessOp =
  | { type: 'crop'; rect: NFrame }
  | { type: 'adjust'; opacity?: number; brightness?: number; contrast?: number; saturation?: number; blurPx?: number }
  | { type: 'flip'; x: boolean; y: boolean; rotate?: 0 | 90 | 180 | 270 }
  | { type: 'textVariant'; text?: string; style?: Partial<TextStyle> }
  | { type: 'recolor'; color: string };

export interface ProcessNode {
  id: string;
  label: string;
  op: ProcessOp;
  board: { x: number; y: number };
}

export interface Override {
  sourceId: string;
  frame?: Partial<Frame>; // design px in the output canvas
  style?: Partial<TextStyle>; // text sources only; setting fontSizePx disables auto-fit for that source
  hidden?: boolean;
  updatedBy: string;
  updatedAt: string; // ISO
}

export interface OutputNode {
  id: string;
  label: string;
  presetId?: string;
  size: Size; // trim size as typed
  dpi?: number; // mm outputs; default DEFAULTS.printDpi
  exportScale?: number; // px outputs; 1..4, default 1
  bleedMm?: number; // default 0 (print presets set 3)
  safeMarginPct?: number; // default DEFAULTS.safeMarginPct
  family: LayoutFamily; // default 'auto'
  overrides: Override[]; // empty = fully automatic
  /** Output-only layers (D32, T12.4): its own rows, front first (row index = port), drawn above the composition's
   *  layers while a `layer` edge feeds them. Absent = none. */
  layers?: string[];
  /** Only present while disconnected: frames captured at disconnect time. Deleted on reconnect.
   *  Frames only: text/asset content edits on sources still show; positions/sizes stay frozen. */
  frozen?: { items: { sourceId: string; frame: Frame; fontSizePx?: number }[] };
  /** Editor transform histories (D41): per output, so resets survive a reload. Absent = none. */
  transforms?: LayerTransforms;
  /** D50: the layout of its master this output uses, chosen in the Core Preset Guide; absent = the closest shape. */
  layout?: GuideFamily;
  board: { x: number; y: number };
}

/**
 * A wire on the board (D32). `layer`: an input or process feeds a composition row, a process, or an output's
 * own layers. `composition`: a composition feeds an output; an output is "connected" iff it has one (no flag).
 * Each in-port takes one edge; an out-port can feed many. No cycles.
 */
export type EdgeKind = 'layer' | 'composition';
export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Reroute points on the board (T13.8), in order from `from` to `to`; board only. */
  points?: { x: number; y: number }[];
}

/** A board group (T13.7): a frame drawn around its nodes (its box is computed from theirs, never stored). */
export interface BoardGroup {
  id: string;
  label: string;
  color: GroupColor;
  /** Node ids (inputs, processes, compositions, outputs). */
  nodes: string[];
  collapsed?: boolean;
}
export type GroupColor = 'grey' | 'blue' | 'purple' | 'green' | 'orange' | 'red';

export interface ProjectDoc {
  schema: 2;
  rev: number; // increments on every save; reject stale writes
  name: string;
  compositions: Composition[]; // [0] is 'main'; length <= LIMITS.maxCompositions
  sources: InputSource[]; // length <= LIMITS.maxSources
  processes: ProcessNode[]; // length <= LIMITS.maxProcesses
  outputs: OutputNode[]; // length <= LIMITS.maxOutputs
  edges: Edge[];
  /** Board groups (T13.7): named, coloured frames around nodes; absent = none. Board only, no effect on layout. */
  groups?: BoardGroup[];
  /** Assets cards (D40): one board node holding many pictures; absent = none. Board only, no effect on layout. */
  stacks?: AssetStack[];  /** D44: Headline cards — a Khmer and an English picture of one headline, one of them in use. */
  headlines?: LanguagePair[];
  /** D46: Preset nodes — a list of output sizes (e.g. GDN) fed by one master preview. */
  presetSets?: PresetSet[];
  /** D47: Core Rule nodes — each shows how one master preview adapts (layer comp, guides, auto layout). */
  coreRules?: CoreRuleNode[];
  /** D48: the layer comp's group order, front first ('logo' | 'headline' | 'elements' | 'background'); absent = default. */
  layerOrder?: ('logo' | 'headline' | 'elements' | 'background')[];
}

/** D47: a Core Rule node on the board, for one master preview. Its contents are derived, never stored. */
export interface CoreRuleNode {
  id: string;
  composition: string;
  board: { x: number; y: number };
}

/**
 * D46: a Preset node (PDF page 3, "GDN Preset Node"): one node listing many output sizes, fed by one wire from a
 * master preview; each size is its own output (its "Preview" node) wired from its row. `outputs` in row order.
 */
export interface PresetSet {
  id: string;
  label: string;
  board: { x: number; y: number };
  outputs: string[];
  /** D51: sizes whose Preview is hidden on the board (board only: they still lay out and export). */
  hidden?: string[];
}

/**
 * D44: a Headline card (PDF page 3, "Headline asset Node"): the same headline as a Khmer picture and an English
 * picture, each its own input (its own placement and overrides); only the one in `use` is drawn, everywhere.
 */
export interface LanguagePair {
  id: string;
  label: string;
  board: { x: number; y: number };
  km: string;
  en: string;
  use: 'km' | 'en';
  /** N3: more Khmer / English pairs in the same card (each its own two inputs); `use` applies to all. */
  more?: { km: string; en: string }[];
}

/**
 * An Assets card (D40): one board node that holds many pictures. Each picture is still its own input (and layer:
 * placement, behaviour, processes, overrides); the card only draws them together. `items` lists the input ids in
 * card order; an input is in one card at most, and ids that no longer exist are ignored.
 */
export interface AssetStack {
  id: string;
  label: string;
  board: { x: number; y: number };
  items: string[];
  /** D49: what the card holds — pictures (default, the Image node), logos (the Logo node) or text slots (the Text node). */
  kind?: 'image' | 'logo' | 'text';
}

// ---------- team-level records ----------
export interface Asset {
  id: string; teamId: string; kind: 'image' | 'vector' | 'font';
  mime: string; bytes: number; sha256: string; storageKey: string;
  width?: number; height?: number; // images
  fontFamily?: string; // fonts
}
export interface LibraryItem {
  id: string; teamId: string; name: string; tags: string[];
  kind: SourceKind; behavesLike: Behavior; content: SourceContent;
}
export interface SizePreset {
  id: string; teamId: string | null; // null = built-in
  group: PresetGroup; name: string; size: Size; dpi?: number; bleedMm?: number;
  /** N5: the Preset node family (e.g. 'GDN'): its sizes are added together as one Preset node. Absent = a single size. */
  family?: string;
}
export interface ExportOptions {
  scale?: number; dpi?: number; // px outputs use scale, mm outputs use dpi
  withBleed?: boolean; cropMarks?: boolean; outlineText?: boolean; quality?: number; // jpg/webp 1..100
}
export interface ExportJob {
  id: string; projectId: string; outputIds: string[]; format: ExportFormat;
  options: ExportOptions; status: 'queued' | 'running' | 'done' | 'failed';
  progress: number; resultAssetId?: string; error?: string; createdBy: string; createdAt: string;
}

// ---------- unit math (pure) ----------
export const MM_PER_IN = 25.4;
export const DESIGN_DPI = 96;

export function toDesignPx(value: number, unit: Unit): number {
  return unit === 'mm' ? (value / MM_PER_IN) * DESIGN_DPI : value;
}

export interface CanvasMetrics {
  trim: { w: number; h: number };
  bleed: number; // design px, each side
  full: { w: number; h: number }; // trim + bleed both sides
  safe: { x: number; y: number; w: number; h: number }; // in bleed-box coordinates
}

export function canvasMetrics(o: Pick<OutputNode, 'size' | 'bleedMm' | 'safeMarginPct'>): CanvasMetrics {
  const trim = { w: toDesignPx(o.size.width, o.size.unit), h: toDesignPx(o.size.height, o.size.unit) };
  const bleed = toDesignPx(o.bleedMm ?? 0, 'mm');
  const margin = ((o.safeMarginPct ?? DEFAULTS.safeMarginPct) / 100) * Math.min(trim.w, trim.h);
  return {
    trim,
    bleed,
    full: { w: trim.w + 2 * bleed, h: trim.h + 2 * bleed },
    safe: { x: bleed + margin, y: bleed + margin, w: trim.w - 2 * margin, h: trim.h - 2 * margin },
  };
}

/** design px → export pixels multiplier */
export function exportScaleOf(o: Pick<OutputNode, 'size' | 'dpi' | 'exportScale'>): number {
  return o.size.unit === 'mm' ? (o.dpi ?? DEFAULTS.printDpi) / DESIGN_DPI : o.exportScale ?? 1;
}

export function exportPixels(
  o: Pick<OutputNode, 'size' | 'dpi' | 'exportScale' | 'bleedMm' | 'safeMarginPct'>,
  withBleed: boolean,
): { w: number; h: number } {
  const m = canvasMetrics(o);
  const s = exportScaleOf(o);
  const box = withBleed ? m.full : m.trim;
  return { w: Math.round(box.w * s), h: Math.round(box.h * s) };
}

export function exceedsExportCap(px: { w: number; h: number }): boolean {
  return Math.max(px.w, px.h) > LIMITS.maxExportEdgePx;
}

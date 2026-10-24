/**
 * Artwork Adaptation — shared model (packages/core/src/model.ts).
 * Source of truth for types and unit math. Copy as-is.
 *
 * Storage: `ProjectDoc` is saved as one JSONB column on `projects` (with `rev` for optimistic locking).
 * Separate tables: users, teams, memberships, invites, sessions, project_versions (D62, project history),
 * review_comments and output_approvals (D63, review of Previews), assets, library_items, presets, export_jobs.
 * Layout results are NEVER stored; only overrides are (inside ProjectDoc.outputs[].overrides).
 */

export type Unit = 'px' | 'mm';
export type TeamRole = 'admin' | 'editor' | 'viewer';
export type SourceKind = 'image' | 'vector' | 'text' | 'fill';
export type Behavior = 'background' | 'subject' | 'text' | 'logo' | 'decoration';
export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf';
export type PresetGroup = 'print' | 'social';

export const LIMITS = {
  maxSources: 10, // includes the 4 defaults
  maxOutputs: 100, // D46 (was 10)
  maxCompositions: 3, // D56: the master and its layouts
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
  x: number; y: number; width: number; height: number;
  scaleX: number; scaleY: number; rotation: number; shear: number;
}
export type TransformOp =
  | { type: 'scale'; kx: number; ky: number; pivot: { x: number; y: number } }
  | { type: 'shear'; axis: 'lr' | 'tb'; k: number; pivot: { x: number; y: number } }
  | { type: 'rotate'; deg: number }
  | { type: 'move'; dx: number; dy: number };
export interface TransformHistory { origin: TransformOrigin; ops: TransformOp[] }
/** Saved editor histories for one scene (a composition or an output), in that scene's design px. */
export interface LayerTransforms {
  /** The scene's design-px size when saved; a size change invalidates the histories. */
  scene: { width: number; height: number };
  layers: Record<string, TransformHistory>;
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
  | { kind: 'image' | 'vector'; assetId: string | null; focal: { x: number; y: number }; variants?: { vertical?: string; horizontal?: string } } // focal 0..1; D43 slots
  | { kind: 'text'; text: string; style: TextStyle }
  | { kind: 'fill'; fill: Fill };

export interface InputSource {
  id: string;
  label: string;
  kind: SourceKind;
  behavesLike: Behavior;
  visible: boolean;
  locked?: true; // D50: not picked, moved or deleted on the editors' canvas
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
  /** D42: a layout guide of another composition (`of`, its master); outputs pick the closest shape. */
  guide?: { of: string; family: 'square' | 'vertical' | 'horizontal' };
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
  overrides: Override[]; // empty = fully automatic
  /** Only present while disconnected: frames captured at disconnect time. Deleted on reconnect.
   *  Frames only: text/asset content edits on sources still show; positions/sizes stay frozen. */
  frozen?: { items: { sourceId: string; frame: Frame; fontSizePx?: number }[] };
  /** Editor transform histories (D41): per output, so resets survive a reload. Absent = none. */
  transforms?: LayerTransforms;
  layout?: 'square' | 'vertical' | 'horizontal'; // D50: chosen in the Core Preset Guide; absent = closest shape
  board: { x: number; y: number };
}

/**
 * A wire on the board (D32; D56). `layer`: an input feeds a composition row. `composition`: a composition feeds
 * an output; an output is "connected" iff it has one (no flag). Each in-port takes one edge; an out-port can feed many.
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
  /** Node ids (inputs, asset cards, compositions, Preset nodes, outputs). */
  nodes: string[];
  collapsed?: boolean;
}
export type GroupColor = 'grey' | 'blue' | 'purple' | 'green' | 'orange' | 'red';

export interface ProjectDoc {
  schema: 4; // D61 (v1–v3 are migrated on load: migrateProjectDoc; v4 dropped output.family)
  rev: number; // increments on every save; reject stale writes
  name: string;
  compositions: Composition[]; // [0] is 'main', then its layout guides (D42, D56); length <= LIMITS.maxCompositions
  sources: InputSource[]; // length <= LIMITS.maxSources
  outputs: OutputNode[]; // length <= LIMITS.maxOutputs
  edges: Edge[];
  /** Board groups (T13.7): named, coloured frames around nodes; absent = none. Board only, no effect on layout. */
  groups?: BoardGroup[];
  /** Assets cards (D40): one board node holding many pictures; absent = none. Board only, no effect on layout. */
  stacks?: AssetStack[];
  /** D44: Headline cards (a Khmer and an English input, one in use). */
  headlines?: { id: string; label: string; board: { x: number; y: number }; km: string; en: string; use: 'km' | 'en'; more?: { km: string; en: string }[] }[]; // more: N3
  // D46: Preset nodes — each lists output ids (its sizes, in row order).
  presetSets?: { id: string; label: string; board: { x: number; y: number }; outputs: string[]; hidden?: string[] }[]; // hidden: D51
  // D48: the layer comp's group order, front first; absent = logo, headline, elements, background.
  layerOrder?: ('logo' | 'headline' | 'elements' | 'background')[];
}

/** D40: an Assets card. Each picture is its own input (layer); the card only draws them together, `items` in card order. */
export interface AssetStack {
  id: string;
  label: string;
  board: { x: number; y: number };
  items: string[];
  kind?: 'image' | 'logo' | 'text'; // D49: the Image (default), Logo or Text node
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
  family?: string; // N5: the Preset node family (e.g. 'GDN'); absent = a single size
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

/**
 * Export settings shared by the API (validation, caps), the worker (rendering) and the UI (file names).
 * Formats per D22; one export job per output (PRODUCT-SPEC: failures reported per output).
 */
import { exceedsExportCap, exportPixels, exportScaleOf, LIMITS, type ExportFormat, type ExportOptions, type OutputNode } from './model';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpg', 'webp', 'pdf', 'svg'];
export const RASTER_FORMATS: readonly ExportFormat[] = ['png', 'jpg', 'webp'];

export const EXPORT_MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
};

/** The output as it will be exported: per-export scale (px outputs) or dpi (mm outputs) override its own. */
export function effectiveOutput<T extends Pick<OutputNode, 'size' | 'dpi' | 'exportScale' | 'bleedMm' | 'safeMarginPct'>>(o: T, opts: ExportOptions): T {
  return {
    ...o,
    ...(o.size.unit === 'px' && opts.scale !== undefined ? { exportScale: opts.scale } : {}),
    ...(o.size.unit === 'mm' && opts.dpi !== undefined ? { dpi: opts.dpi } : {}),
  };
}

/** Include the bleed? Default: yes when the output has bleed (print). */
export function withBleedOf(o: Pick<OutputNode, 'bleedMm'>, opts: ExportOptions): boolean {
  return opts.withBleed ?? (o.bleedMm ?? 0) > 0;
}

/** Pixel size of a raster export (null for vector formats, which have no pixel size). */
export function rasterPixels(o: OutputNode, format: ExportFormat, opts: ExportOptions): { w: number; h: number } | null {
  if (!RASTER_FORMATS.includes(format)) return null;
  return exportPixels(effectiveOutput(o, opts), withBleedOf(o, opts));
}

/** Render scale (output px per design px) for a format: vector formats print at 1 (96 per inch). */
export function renderScaleOf(o: OutputNode, format: ExportFormat, opts: ExportOptions): number {
  return RASTER_FORMATS.includes(format) ? exportScaleOf(effectiveOutput(o, opts)) : 1;
}

/** D31: rasters up to this long edge (px) are made in the user's browser; larger ones on the server. */
export const BROWSER_MAX_EDGE_PX = 4096;

/**
 * D31 hybrid export: where a file is made. The browser makes SVG with live text and rasters up to
 * BROWSER_MAX_EDGE_PX; the server makes PDF, SVG with outlined text and larger rasters. (The UI also sends
 * everything to the server when the browser fails its feature check.)
 */
export function exportRoute(o: OutputNode, format: ExportFormat, opts: ExportOptions): 'browser' | 'server' {
  if (format === 'pdf') return 'server';
  if (format === 'svg') return opts.outlineText ? 'server' : 'browser';
  const px = rasterPixels(o, format, opts);
  return px && Math.max(px.w, px.h) <= BROWSER_MAX_EDGE_PX ? 'browser' : 'server';
}

/**
 * M6: above this many raster pixels in one multi-file export, every file is made and zipped on the server: the
 * browser would otherwise render each one and hold them all in memory to build the ZIP.
 */
export const BROWSER_ZIP_MAX_PX = 40_000_000;

/** M6: total raster pixels of an export (vector formats count 0: their files are small). */
export function exportPixelTotal(outputs: readonly OutputNode[], format: ExportFormat, opts: ExportOptions): number {
  return outputs.reduce((n, o) => {
    const px = rasterPixels(o, format, opts);
    return n + (px ? px.w * px.h : 0);
  }, 0);
}

/** M6: a multi-file export too large to zip in the browser. */
export const zipOnServer = (outputs: readonly OutputNode[], format: ExportFormat, opts: ExportOptions): boolean =>
  outputs.length > 1 && exportPixelTotal(outputs, format, opts) > BROWSER_ZIP_MAX_PX;

/** T6.7: a raster export larger than LIMITS.maxExportEdgePx is refused, with the reason. */
export function exportCapError(o: OutputNode, format: ExportFormat, opts: ExportOptions): string | null {
  const px = rasterPixels(o, format, opts);
  if (!px || !exceedsExportCap(px)) return null;
  return `${o.label}: ${px.w} × ${px.h} px is over the ${LIMITS.maxExportEdgePx} px limit`;
}

const safe = (s: string) =>
  s
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'untitled';

/** `{project}_{output}_{WxH}.{ext}` (Flow 8): export pixels for raster, the typed size for PDF/SVG. */
export function exportFileName(project: string, o: OutputNode, format: ExportFormat, opts: ExportOptions): string {
  const px = rasterPixels(o, format, opts);
  const size = px ? `${px.w}x${px.h}` : `${o.size.width}x${o.size.height}${o.size.unit}`;
  return `${safe(project)}_${safe(o.label)}_${size}.${format}`;
}

/** Name of a "download all" archive (API and browser ZIPs alike); N6: a Preset node's ZIP is named by its family. */
export function exportZipName(project: string, family?: string): string {
  return `${safe(project)}_${family?.trim() ? safe(family) : 'exports'}.zip`;
}

/** Where a finished export file is stored (worker writes, API serves). */
export function exportStorageKey(teamId: string, jobId: string, format: ExportFormat): string {
  return `teams/${teamId}/exports/${jobId}.${format}`;
}

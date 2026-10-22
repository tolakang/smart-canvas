/**
 * PNG / JPG / WebP export (T6.2) from a ready render page: one screenshot of the canvas at its export
 * pixel size (the page is already scaled to exportPixels). PNG keeps transparency; JPG and WebP are encoded
 * from that lossless shot with sharp (D27): JPG flattened on white with full-resolution colour (4:4:4 — the
 * browser's encoder halves colour resolution and smears red text and coloured edges), WebP with sharp's
 * smart subsampling (WebP lossy is always 4:2:0).
 */
import type { Page } from 'playwright';
import sharp from 'sharp';
import { FRAME, renderedSize } from './render';

export type RasterFormat = 'png' | 'jpg' | 'webp';

export interface RasterOptions {
  /** jpg / webp quality 1..100 (default 90). */
  quality?: number;
}

export interface RasterResult {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
}

const MIME: Record<RasterFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export async function exportRaster(page: Page, format: RasterFormat, opts: RasterOptions = {}): Promise<RasterResult> {
  const quality = Math.min(100, Math.max(1, Math.round(opts.quality ?? 90)));
  const { width, height } = await renderedSize(page);
  // The whole canvas must be inside the viewport: element screenshots never scale.
  await page.setViewportSize({ width: Math.max(width, 1), height: Math.max(height, 1) });
  const canvas = page.locator(FRAME).first();
  const shot = await canvas.screenshot({ type: 'png', omitBackground: format !== 'jpg', animations: 'disabled', scale: 'css' });
  const bytes =
    format === 'webp' ? await sharp(shot).webp({ quality, smartSubsample: true }).toBuffer()
    : format === 'jpg' ? await sharp(shot).flatten({ background: '#ffffff' }).jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer()
    : shot;
  const meta = await sharp(bytes).metadata();
  return { bytes, mime: MIME[format], width: meta.width ?? width, height: meta.height ?? height };
}

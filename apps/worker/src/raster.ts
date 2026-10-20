/**
 * PNG / JPG / WebP export (T6.2) from a ready render page: one screenshot of the canvas at its export
 * pixel size (the page is already scaled to exportPixels). PNG keeps transparency; JPG is flattened on
 * white; WebP is encoded from the PNG with sharp (D27).
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
  const png = format !== 'jpg';
  const shot = await canvas.screenshot({ type: png ? 'png' : 'jpeg', omitBackground: png, ...(png ? {} : { quality }), animations: 'disabled', scale: 'css' });
  const bytes = format === 'webp' ? await sharp(shot).webp({ quality }).toBuffer() : shot;
  const meta = await sharp(bytes).metadata();
  return { bytes, mime: MIME[format], width: meta.width ?? width, height: meta.height ?? height };
}

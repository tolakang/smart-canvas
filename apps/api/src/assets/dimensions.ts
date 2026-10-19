import { imageSize } from 'image-size';

/** Pixel size for rasters; for SVG the width/height (or viewBox) in user units. Null when not determinable. */
export function dimensions(buf: Uint8Array): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(buf);
    return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
  } catch {
    return null;
  }
}

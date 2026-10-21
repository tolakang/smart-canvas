/**
 * Where a picture's visible pixels are (D37): the bounding box of its non-transparent pixels, 0..1 of the
 * picture. Measured in the browser — the board, browser export and the worker's render page all run this
 * same code, so preview and export agree. The picture is drawn at most MAX px on its long side; the box is
 * rounded outwards, so it never cuts visible pixels.
 */
export type Trim = { x: number; y: number; w: number; h: number };

const MAX = 1024;
/** Alpha at or below this (of 255) counts as transparent: soft shadows' faint tails don't pad the box. */
const ALPHA_MIN = 8;
const FULL: Trim = { x: 0, y: 0, w: 1, h: 1 };

/** The visible box of RGBA pixels (`width` × `height`), or the full picture when nothing (or everything) shows. */
export function trimOfPixels(data: Uint8ClampedArray, width: number, height: number): Trim {
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) <= ALPHA_MIN) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return FULL; // fully transparent: nothing to hug
  return { x: x0 / width, y: y0 / height, w: (x1 + 1 - x0) / width, h: (y1 + 1 - y0) / height };
}

/** Measure a picture by URL. JPEGs have no alpha: the full picture. Fails soft (undefined) when it can't load. */
export async function measureTrim(url: string, mime?: string, size?: { width: number; height: number }): Promise<Trim | undefined> {
  if (mime === 'image/jpeg') return FULL;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || size?.width || 0;
    const h0 = img.naturalHeight || size?.height || 0;
    if (!w0 || !h0) return undefined;
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const [w, h] = [Math.max(1, Math.round(w0 * k)), Math.max(1, Math.round(h0 * k))];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return trimOfPixels(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return undefined;
  }
}

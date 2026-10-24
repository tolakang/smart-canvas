import { describe, expect, it } from 'vitest';
import { BROWSER_ZIP_MAX_PX, effectiveOutput, exportCapError, exportPixelTotal, exportRoute, exportFileName, exportZipName, rasterPixels, renderScaleOf, withBleedOf, zipOnServer } from './exports';
import type { OutputNode } from './model';

const out = (patch: Partial<OutputNode> = {}): OutputNode => ({
  id: 'o',
  label: 'Instagram',
  size: { width: 1080, height: 1350, unit: 'px' },
  overrides: [],
  board: { x: 0, y: 0 },
  ...patch,
});
const a4 = out({ label: 'A4 poster', size: { width: 210, height: 297, unit: 'mm' }, dpi: 300, bleedMm: 3 });

describe('export settings', () => {
  it('per-export scale / dpi override the output', () => {
    expect(effectiveOutput(out({ exportScale: 1 }), { scale: 3 }).exportScale).toBe(3);
    expect(effectiveOutput(a4, { dpi: 150 }).dpi).toBe(150);
    expect(effectiveOutput(a4, { scale: 3 }).exportScale).toBeUndefined(); // scale is for px outputs
  });

  it('bleed is included by default only when the output has one', () => {
    expect(withBleedOf(a4, {})).toBe(true);
    expect(withBleedOf(a4, { withBleed: false })).toBe(false);
    expect(withBleedOf(out(), {})).toBe(false);
  });

  it('raster pixels follow exportPixels (example F); vector formats have none', () => {
    expect(rasterPixels(a4, 'png', {})).toEqual({ w: 2551, h: 3579 });
    expect(rasterPixels(a4, 'jpg', { withBleed: false })).toEqual({ w: 2480, h: 3508 });
    expect(rasterPixels(out(), 'webp', { scale: 2 })).toEqual({ w: 2160, h: 2700 });
    expect(rasterPixels(a4, 'pdf', {})).toBeNull();
    expect(renderScaleOf(a4, 'pdf', {})).toBe(1);
    expect(renderScaleOf(a4, 'png', {})).toBeCloseTo(300 / 96);
  });

  it('caps raster exports at 12000 px with a clear message', () => {
    expect(exportCapError(out(), 'png', { scale: 4 })).toBeNull(); // 4320 × 5400
    expect(exportCapError(out({ size: { width: 3001, height: 1000, unit: 'px' } }), 'png', { scale: 4 })).toBe('Instagram: 12004 × 4000 px is over the 12000 px limit');
    expect(exportCapError(out({ size: { width: 3001, height: 1000, unit: 'px' } }), 'pdf', { scale: 4 })).toBeNull();
  });

  it('file names: {project}_{output}_{WxH}.{ext}, filesystem-safe', () => {
    expect(exportFileName('Grand opening', out(), 'png', { scale: 2 })).toBe('Grand-opening_Instagram_2160x2700.png');
    expect(exportFileName('Poster', a4, 'pdf', {})).toBe('Poster_A4-poster_210x297mm.pdf');
    expect(exportFileName('a/b:c', out({ label: 'ផ្ទាំង' }), 'svg', {})).toBe('a-b-c_ផ្ទាំង_1080x1350px.svg');
    expect(exportFileName('', out({ label: '...' }), 'jpg', {})).toBe('untitled_untitled_1080x1350.jpg');
  });

  it('ZIP names: the project\'s exports, or (N6) a Preset node\'s family', () => {
    expect(exportZipName('Grand opening')).toBe('Grand-opening_exports.zip');
    expect(exportZipName('Grand opening', 'App banner')).toBe('Grand-opening_App-banner.zip');
    expect(exportZipName('Grand opening', '  ')).toBe('Grand-opening_exports.zip');
  });
});

describe('hybrid export route (D31)', () => {
  it('browser: SVG with live text and rasters up to 4096 px', () => {
    expect(exportRoute(out(), 'png', {})).toBe('browser'); // 1080×1350
    expect(exportRoute(out(), 'jpg', { scale: 3 })).toBe('browser'); // 3240×4050
    expect(exportRoute(out(), 'svg', {})).toBe('browser');
  });
  it('server: PDF, outlined SVG and rasters over 4096 px', () => {
    expect(exportRoute(out(), 'pdf', {})).toBe('server');
    expect(exportRoute(out(), 'svg', { outlineText: true })).toBe('server');
    expect(exportRoute(out(), 'webp', { scale: 4 })).toBe('server'); // 4320×5400
    expect(exportRoute(a4, 'png', {})).toBe('browser'); // 300 dpi A4 + bleed: 2551×3579
    expect(exportRoute(out({ size: { width: 297, height: 420, unit: 'mm' }, dpi: 300 }), 'png', {})).toBe('server'); // A3: 3508×4961
  });
});

describe('server ZIP for large exports (M6)', () => {
  const out = (id: string, w: number, h: number) => ({ id, label: id, size: { width: w, height: h, unit: 'px' as const } }) as unknown as Parameters<typeof rasterPixels>[0];
  const big = [out('a', 4000, 4000), out('b', 4000, 4000), out('c', 4000, 4000)];
  it('counts raster pixels; vector formats count nothing', () => {
    expect(exportPixelTotal(big, 'png', {})).toBe(48_000_000);
    expect(exportPixelTotal(big, 'png', { scale: 0.5 })).toBe(12_000_000);
    expect(exportPixelTotal(big, 'svg', {})).toBe(0);
  });
  it('several files over the limit zip on the server; one file, or a small set, stays in the browser', () => {
    expect(BROWSER_ZIP_MAX_PX).toBe(40_000_000);
    expect(zipOnServer(big, 'jpg', {})).toBe(true);
    expect(zipOnServer(big.slice(0, 2), 'jpg', {})).toBe(false);
    expect(zipOnServer([out('x', 12000, 12000)], 'png', {})).toBe(false);
    expect(zipOnServer(big, 'pdf', {})).toBe(false);
  });
});

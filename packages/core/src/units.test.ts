import { describe, expect, it } from 'vitest';
import { canvasMetrics, exceedsExportCap, exportPixels, exportScaleOf, toDesignPx, type OutputNode } from './model';
import { convertLength, convertSize, fromDesignPx, roundForUnit } from './units';

type Out = Pick<OutputNode, 'size' | 'dpi' | 'exportScale' | 'bleedMm' | 'safeMarginPct'>;
const a4: Out = { size: { width: 210, height: 297, unit: 'mm' }, dpi: 300 };
const insta: Out = { size: { width: 1080, height: 1350, unit: 'px' } };

describe('design px', () => {
  it('converts mm at 96 per inch and leaves px alone', () => {
    expect(toDesignPx(25.4, 'mm')).toBeCloseTo(96);
    expect(toDesignPx(1080, 'px')).toBe(1080);
    expect(fromDesignPx(96, 'mm')).toBeCloseTo(25.4);
    expect(fromDesignPx(toDesignPx(210, 'mm'), 'mm')).toBeCloseTo(210);
  });

  it('converts lengths and sizes between units', () => {
    expect(convertLength(210, 'mm', 'px')).toBeCloseTo(793.7, 1);
    expect(convertLength(500, 'px', 'px')).toBe(500);
    expect(convertSize(a4.size, 'px')).toEqual({ width: 794, height: 1123, unit: 'px' });
    expect(convertSize({ width: 794, height: 1123, unit: 'px' }, 'mm')).toEqual({ width: 210.1, height: 297.1, unit: 'mm' });
    expect(convertSize(insta.size, 'px')).toBe(insta.size);
    expect(roundForUnit(12.345, 'mm')).toBe(12.3);
    expect(roundForUnit(12.5, 'px')).toBe(13);
  });
});

describe('canvasMetrics', () => {
  it('adds bleed on each side and puts the safe rect inside the trim', () => {
    const m = canvasMetrics({ size: { width: 3000, height: 1000, unit: 'px' } });
    expect(m).toEqual({ trim: { w: 3000, h: 1000 }, bleed: 0, full: { w: 3000, h: 1000 }, safe: { x: 50, y: 50, w: 2900, h: 900 } });
    const p = canvasMetrics({ ...a4, bleedMm: 3 });
    const b = toDesignPx(3, 'mm');
    expect(p.bleed).toBeCloseTo(b);
    expect(p.full.w).toBeCloseTo(toDesignPx(216, 'mm'));
    expect(p.safe.x).toBeCloseTo(b + 0.05 * toDesignPx(210, 'mm'));
  });

  it('honours a custom safe margin', () => {
    expect(canvasMetrics({ ...insta, safeMarginPct: 0 }).safe).toEqual({ x: 0, y: 0, w: 1080, h: 1350 });
  });
});

describe('export size (ADAPTATION-RULES example F)', () => {
  it('A4 at 300 dpi: 2480×3508 trim, 2551×3579 with 3 mm bleed', () => {
    expect(exportPixels(a4, false)).toEqual({ w: 2480, h: 3508 });
    expect(exportPixels({ ...a4, bleedMm: 3 }, true)).toEqual({ w: 2551, h: 3579 });
    expect(exportPixels({ ...a4, bleedMm: 3 }, false)).toEqual({ w: 2480, h: 3508 });
  });

  it('1080×1350 px at scale 2 → 2160×2700', () => {
    expect(exportPixels({ ...insta, exportScale: 2 }, false)).toEqual({ w: 2160, h: 2700 });
  });

  it('defaults: mm uses 300 dpi, px uses scale 1', () => {
    expect(exportScaleOf({ size: a4.size })).toBeCloseTo(300 / 96);
    expect(exportScaleOf(insta)).toBe(1);
  });

  it('flags exports over the 12000 px edge cap', () => {
    expect(exceedsExportCap({ w: 12000, h: 100 })).toBe(false);
    expect(exceedsExportCap(exportPixels({ size: { width: 6001, height: 10, unit: 'px' }, exportScale: 2 }, false))).toBe(true);
  });
});

/**
 * Unit helpers on top of the DATA-MODEL math (toDesignPx, canvasMetrics, exportPixels).
 * Design px are 96 per inch (D17); convert only through these, never by hand.
 */
import { DESIGN_DPI, MM_PER_IN, toDesignPx, type Size, type Unit } from './model';

/** Inverse of `toDesignPx`: design px → value in `unit`. */
export function fromDesignPx(px: number, unit: Unit): number {
  return unit === 'mm' ? (px / DESIGN_DPI) * MM_PER_IN : px;
}

/** Rounds a typed length to what the unit's input shows: whole px, 0.1 mm. */
export function roundForUnit(value: number, unit: Unit): number {
  return unit === 'mm' ? Math.round(value * 10) / 10 : Math.round(value);
}

export function convertLength(value: number, from: Unit, to: Unit): number {
  return from === to ? value : fromDesignPx(toDesignPx(value, from), to);
}

/** Same physical size in another unit (px/mm toggle), rounded for display. */
export function convertSize(size: Size, unit: Unit): Size {
  if (size.unit === unit) return size;
  return {
    width: roundForUnit(convertLength(size.width, size.unit, unit), unit),
    height: roundForUnit(convertLength(size.height, size.unit, unit), unit),
    unit,
  };
}

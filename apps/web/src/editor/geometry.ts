/**
 * Editor geometry. The canvas is drawn at `scale` screen px per design px; placements are NFrames
 * (0..1 of the canvas). A Box is the unrotated rectangle in screen px plus rotation in degrees.
 */
import type { NFrame } from '@smart-canvas/core';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
export interface Canvas {
  width: number; // design px
  height: number;
}

export function toBox(f: NFrame, canvas: Canvas, scale: number): Box {
  return {
    x: f.x * canvas.width * scale,
    y: f.y * canvas.height * scale,
    w: f.w * canvas.width * scale,
    h: f.h * canvas.height * scale,
    rotation: f.rotation ?? 0,
  };
}

export function toNFrame(b: Box, canvas: Canvas, scale: number): NFrame {
  return {
    x: b.x / scale / canvas.width,
    y: b.y / scale / canvas.height,
    w: b.w / scale / canvas.width,
    h: b.h / scale / canvas.height,
    ...(b.rotation ? { rotation: b.rotation } : {}),
  };
}

/** Moves a placement by whole design px (arrow keys: 1, with Shift: 10). */
export function nudge(f: NFrame, dx: number, dy: number, canvas: Canvas): NFrame {
  return { ...f, x: f.x + dx / canvas.width, y: f.y + dy / canvas.height };
}

/** A frame with its rotation cleared, keeping shear, position and size. */
export function resetRotation<T extends { rotation?: number }>(f: T): T {
  return { ...f, rotation: 0 };
}

/** A frame with rotation and shear cleared, keeping position and size. */
export function resetTransform<T extends { rotation?: number; shear?: number }>(f: T): T {
  return { ...f, rotation: 0, shear: 0 };
}

export const NUDGE_STEP = { normal: 1, shift: 10 } as const;

/** Largest scale that fits the canvas in the available area, with a margin. */
export function fitScale(canvas: Canvas, area: { width: number; height: number }, margin = 32): number {
  const w = Math.max(area.width - margin * 2, 50);
  const h = Math.max(area.height - margin * 2, 50);
  return Math.min(w / canvas.width, h / canvas.height);
}

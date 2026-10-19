/**
 * CSS for fills, shared by the input editors, the renderer and export.
 * Gradient angle follows CSS `linear-gradient`: 0° points up, 90° left→right, clockwise.
 */
import type { Fill } from './model';

export function fillToCss(fill: Fill): string {
  if (fill.type === 'solid') return fill.color;
  const stops = [...fill.stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${Math.round(s.offset * 1000) / 10}%`);
  return `linear-gradient(${fill.angleDeg}deg, ${stops.join(', ')})`;
}

/**
 * D58: two fingers anywhere on the board pinch-zoom and pan it — over empty canvas, panels and the controls inside
 * them alike. React Flow's own pinch starts only when both fingers land where panning is allowed, so a finger on a
 * panel used to stop it. This takes every two-finger gesture first (capture phase) and keeps it until all fingers
 * are up, so a panel drag or a one-finger pan the first finger began doesn't jump when the second lifts.
 */
import { useEffect, type RefObject } from 'react';

/**
 * D58: on touch the board's no-pan marker. Ports, a selected panel and drag grips carry it; a card's buttons and
 * fields don't (their `nopan` counts with a mouse only), so a finger that lands on them still moves the board.
 */
export const TOUCH_NO_PAN = 'sc-touch-nopan';

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
export interface PinchTarget {
  getViewport(): Viewport;
  setViewport(v: Viewport): unknown;
}

/** The viewport after a pinch: the board point under the first midpoint stays under the current one. */
export function pinchViewport(start: Viewport, from: { mid: { x: number; y: number }; dist: number }, to: { mid: { x: number; y: number }; dist: number }, limits: { min: number; max: number }): Viewport {
  const zoom = Math.min(limits.max, Math.max(limits.min, start.zoom * (from.dist > 0 ? to.dist / from.dist : 1)));
  const wx = (from.mid.x - start.x) / start.zoom;
  const wy = (from.mid.y - start.y) / start.zoom;
  return { x: to.mid.x - wx * zoom, y: to.mid.y - wy * zoom, zoom };
}

export function usePinch(ref: RefObject<HTMLElement | null>, target: () => PinchTarget | null, limits: { min: number; max: number }) {
  const { min, max } = limits;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { vp: Viewport; mid: { x: number; y: number }; dist: number } | null = null;
    /** A two-finger gesture ran: the touches stay ours until every finger is up. */
    let locked = false;
    const measure = (e: TouchEvent) => {
      const box = (el.querySelector('.react-flow') ?? el).getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      if (!a || !b) return null;
      return { mid: { x: (a.clientX + b.clientX) / 2 - box.left, y: (a.clientY + b.clientY) / 2 - box.top }, dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    };
    const begin = (e: TouchEvent) => {
      const flow = target();
      const m = measure(e);
      start = flow && m ? { vp: flow.getViewport(), ...m } : null;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      locked = true;
      begin(e);
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    const onMove = (e: TouchEvent) => {
      if (!locked) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      if (e.touches.length < 2 || !start) return;
      const m = measure(e);
      if (m) target()?.setViewport(pinchViewport(start.vp, start, m, { min, max }));
    };
    const onEnd = (e: TouchEvent) => {
      if (!locked) return;
      if (e.touches.length >= 2) begin(e); // one of three fingers lifted: carry on from here
      else start = null;
      if (e.touches.length === 0) locked = false;
    };
    const opts = { capture: true, passive: false } as const;
    el.addEventListener('touchstart', onStart, opts);
    el.addEventListener('touchmove', onMove, opts);
    el.addEventListener('touchend', onEnd, true);
    el.addEventListener('touchcancel', onEnd, true);
    return () => {
      el.removeEventListener('touchstart', onStart, opts);
      el.removeEventListener('touchmove', onMove, opts);
      el.removeEventListener('touchend', onEnd, true);
      el.removeEventListener('touchcancel', onEnd, true);
    };
  }, [ref, target, min, max]);
}

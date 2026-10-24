/**
 * Long-press on touch screens (D33, T13.6; D58). Holding a finger still for `ms` sends a `contextmenu` event to what
 * is under it, so the existing right-click menus open: a panel's, a port's or the canvas menu. A second finger or a
 * move cancels it. Android browsers fire their own contextmenu on a long-press; when one arrives first it is used
 * instead.
 */
import { useEffect, type RefObject } from 'react';

const MOVE_TOLERANCE = 8;

export function useLongPress(ref: RefObject<HTMLElement | null>, ms = 500) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; id: number } | null = null;
    let native = false;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return cancel();
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      native = false;
      const target = e.target;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!start || native || !(target instanceof Element) || !target.isConnected) return;
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
        start = null;
      }, ms);
    };
    const move = (e: PointerEvent) => {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
    };
    const onNative = (e: Event) => {
      if (e.isTrusted) native = true;
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', cancel, true);
    el.addEventListener('pointercancel', cancel, true);
    el.addEventListener('contextmenu', onNative, true);
    return () => {
      cancel();
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', cancel, true);
      el.removeEventListener('pointercancel', cancel, true);
      el.removeEventListener('contextmenu', onNative, true);
    };
  }, [ref, ms]);
}

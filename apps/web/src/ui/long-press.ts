/**
 * Long-press on touch screens (D33, T13.6; D57). Holding a finger still for `ms`:
 * - on a board panel (not on a control inside it), with `onPanel`: toggles that panel in the selection, the touch
 *   stand-in for Shift-click, with a short vibration where supported; the tap that ends the press is swallowed so
 *   it doesn't select the panel alone again;
 * - anywhere else: sends a `contextmenu` event to what is under it, so the existing right-click menus open.
 * Android browsers fire their own contextmenu on a long-press; when one arrives first it is used instead.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const MOVE_TOLERANCE = 8;
/** Controls inside a panel keep their own long-press (a menu, or nothing). */
const CONTROL = 'button, input, textarea, select, a, label, [contenteditable="true"], .react-flow__handle, [draggable="true"]';

export function useLongPress(ref: RefObject<HTMLElement | null>, ms = 500, onPanel?: (panel: HTMLElement) => boolean) {
  const panelRef = useRef(onPanel);
  useLayoutEffect(() => {
    panelRef.current = onPanel;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; id: number } | null = null;
    let native = false;
    let swallowUntil = 0;
    let panel: HTMLElement | null = null;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const togglePanel = () => {
      const hit = panel && panelRef.current?.(panel);
      if (!hit) return false;
      swallowUntil = Date.now() + 800;
      navigator.vibrate?.(10);
      return true;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return cancel();
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      native = false;
      const target = e.target;
      panel = target instanceof Element && !target.closest(CONTROL) ? (target.closest<HTMLElement>('.react-flow__node') ?? null) : null;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!start || native || !(target instanceof Element) || !target.isConnected) return;
        if (!togglePanel()) target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
        start = null;
      }, ms);
    };
    const move = (e: PointerEvent) => {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
    };
    const onNative = (e: Event) => {
      if (!e.isTrusted) return;
      // The panel press was (or now is) a selection toggle, not a menu.
      if (Date.now() < swallowUntil || (start && togglePanel())) {
        cancel();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      native = true;
    };
    const onClick = (e: MouseEvent) => {
      if (Date.now() >= swallowUntil) return;
      swallowUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', cancel, true);
    el.addEventListener('pointercancel', cancel, true);
    el.addEventListener('contextmenu', onNative, true);
    el.addEventListener('click', onClick, true);
    return () => {
      cancel();
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', cancel, true);
      el.removeEventListener('pointercancel', cancel, true);
      el.removeEventListener('contextmenu', onNative, true);
      el.removeEventListener('click', onClick, true);
    };
  }, [ref, ms]);
}

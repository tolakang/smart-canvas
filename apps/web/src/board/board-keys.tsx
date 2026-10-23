/** Board keyboard shortcuts and remembered toggles (T13.5). */
import { useReactFlow } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FIT_OPTIONS, type CanvasTool } from './CanvasToolbar';

/** A boolean remembered in localStorage (falls back to page memory in private mode). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      // private mode: remembered for this page only
    }
  };
  return [value, set];
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Space on a focused button or link presses it; it only means "pan" elsewhere. */
const pressable = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('button, a, [role="button"], [role="menuitem"], summary');

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export interface BoardKeyActions {
  onTool: (t: CanvasTool) => void;
  onDelete?: () => void;
  /** Esc: clear the selection. */
  onClear: () => void;
  /** Ctrl / ⌘ + A: select every panel. */
  onSelectAll: () => void;
  /** Arrow keys move the selected panels by this many board px (Shift: big steps). False = nothing selected. */
  onNudge?: (dx: number, dy: number, big: boolean) => boolean;
  /** Space held: the Hand tool for as long as it is held (a spring-loaded mode). */
  onSpace: (held: boolean) => void;
  /** Shift + T: Tidy. */
  onTidy?: () => void;
}

/**
 * Board keys: V = Select, H = Hand, Space held = Hand while held, Shift+1 = fit, Shift+T = Tidy, Esc = clear the
 * selection, Ctrl/⌘+A = select all panels, arrows = nudge the selection (Shift: ×10), Delete / Backspace = delete
 * the selection. Off while typing or while an editor is open. Delete is ours, not React Flow's `deleteKeyCode`:
 * that one tracks the key as held-down state and misses a press shorter than a render. Arrows are handled in the
 * capture phase so React Flow's own node nudge (which moves without saving) never sees them.
 */
export function BoardKeys({ disabled, ...actions }: BoardKeyActions & { disabled: boolean }) {
  const { fitView } = useReactFlow();
  // Read fresh on every key press, so the listeners (and a held Space) survive re-renders.
  const ref = useRef(actions);
  useLayoutEffect(() => {
    ref.current = actions;
  });
  useEffect(() => {
    if (disabled) return;
    let space = false;
    const release = () => {
      if (!space) return;
      space = false;
      ref.current.onSpace(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const on = ref.current;
      if (e.defaultPrevented || typing(e.target)) return;
      if (e.code === 'Space') {
        if (pressable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (!space) {
          space = true;
          on.onSpace(true);
        }
        return;
      }
      const arrow = ARROWS[e.key];
      if (arrow && on.onNudge && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (on.onNudge(arrow[0], arrow[1], e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyA') on.onSelectAll();
      else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if (e.key === 'Escape') on.onClear();
      else if (e.code === 'KeyV' && !e.shiftKey) on.onTool('select');
      else if (e.code === 'KeyH' && !e.shiftKey) on.onTool('hand');
      else if (e.code === 'Digit1' && e.shiftKey) void fitView({ ...FIT_OPTIONS, duration: 200 });
      else if (e.code === 'KeyT' && e.shiftKey && on.onTidy) on.onTidy();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && on.onDelete) on.onDelete();
      else return;
      e.preventDefault();
      // A focused panel's own key handling (React Flow re-selects it on Esc) stays out; menus and popovers still
      // hear the key.
      if (e.target instanceof Element && e.target.classList.contains('react-flow__node')) e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') release();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', release);
    return () => {
      release();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', release);
    };
  }, [disabled, fitView]);
  return null;
}

/** Board keyboard shortcuts and remembered toggles (T13.5). */
import { useReactFlow } from '@xyflow/react';
import { useEffect, useState } from 'react';
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

/** V = select, H = hand, Shift+1 = fit. Off while typing or while an editor is open. Space-to-pan is React Flow's own. */
export function BoardKeys({ onTool, disabled }: { onTool: (t: CanvasTool) => void; disabled: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyV' && !e.shiftKey) onTool('select');
      else if (e.code === 'KeyH' && !e.shiftKey) onTool('hand');
      else if (e.code === 'Digit1' && e.shiftKey) void fitView({ ...FIT_OPTIONS, duration: 200 });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, onTool, fitView]);
  return null;
}

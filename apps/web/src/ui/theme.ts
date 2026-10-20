/**
 * Light / dark theme (D34). Follows the system setting until the user picks one with the toggle; the pick is
 * remembered per browser. The theme is a `data-theme` attribute on <html>; all colours are tokens on it.
 */
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'sc-theme';

const stored = (): Theme | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
};
const system = (): Theme => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const currentTheme = (): Theme => stored() ?? system();

/** Sets the theme on <html> (call once before the first render, so nothing flashes). */
export function applyTheme(theme: Theme = currentTheme()): void {
  document.documentElement.dataset.theme = theme;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  // Without a stored pick, follow the system when it changes.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => !stored() && setTheme(system());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const toggle = () =>
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // private mode: the pick lasts for this page only
      }
      return next;
    });
  return [theme, toggle];
}

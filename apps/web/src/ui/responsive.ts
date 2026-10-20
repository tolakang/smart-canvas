/**
 * Responsive workspace (D33, T13.6): one app, three layouts.
 * - desktop (≥ 1280 px): library and inspector docked;
 * - tablet (768–1279 px): they open as overlays, one at a time;
 * - phone (< 768 px): full-screen canvas, bottom sheets, condensed top bar.
 * `coarse` is a touch-first pointer (bigger hit targets, Hand tool by default).
 */
import { useSyncExternalStore } from 'react';

export type Screen = 'desktop' | 'tablet' | 'phone';

export const PHONE_QUERY = '(max-width: 767px)';
export const TABLET_QUERY = '(max-width: 1279px)';
export const COARSE_QUERY = '(pointer: coarse)';

const matches = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const lists = [PHONE_QUERY, TABLET_QUERY, COARSE_QUERY].map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

export function screenOf(phone: boolean, tablet: boolean): Screen {
  return phone ? 'phone' : tablet ? 'tablet' : 'desktop';
}

export function useScreen(): Screen {
  return useSyncExternalStore(subscribe, () => screenOf(matches(PHONE_QUERY), matches(TABLET_QUERY)), () => 'desktop');
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, () => matches(COARSE_QUERY), () => false);
}

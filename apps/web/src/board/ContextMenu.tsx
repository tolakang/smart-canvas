/**
 * Right-click menu for the board (T8.2 nodes, T8.4 empty canvas), also the ⋯ menus of the Projects screen: a
 * small list at the pointer, closed by a click elsewhere, Escape or choosing an item; ↑ ↓ Home End move between
 * items.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { COARSE_QUERY } from '../ui/responsive';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Starts a new group (a divider above). */
  separated?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
      if (to === null || items.length === 0) return;
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // A menu wider than the guess (long labels) still stays on screen (T13.6: phones).
  useLayoutEffect(() => {
    const el = ref.current;
    const over = el ? el.getBoundingClientRect().right - (window.innerWidth - 8) : 0;
    if (el && over > 0) el.style.left = `${Math.max(8, el.offsetLeft - over)}px`;
  });
  // Keep the menu inside the window.
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 220));
  const row = window.matchMedia?.(COARSE_QUERY).matches ? 44 : 30; // T13.6: 44 px rows on touch
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 40 - menu.items.length * row));
  return (
    <div ref={ref} className="sc-menu" role="menu" aria-label={menu.title ?? 'Menu'} style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {menu.title && <div className="sc-menu__title">{menu.title}</div>}
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`sc-menu__item${item.danger ? ' sc-menu__item--danger' : ''}${item.separated ? ' sc-menu__item--sep' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

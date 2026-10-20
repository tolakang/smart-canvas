/**
 * Right-click menu for the board (T8.2 nodes, T8.4 empty canvas): a small list at the pointer, closed by a
 * click elsewhere, Escape or choosing an item.
 */
import { useEffect, useRef } from 'react';

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
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Keep the menu inside the window.
  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - 40 - menu.items.length * 30);
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

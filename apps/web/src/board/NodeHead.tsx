/**
 * V1 (2026-10-25, owner: "Header text of each panel should drop by line, should not squeeze in one line"): a board
 * node's header — a kind icon, the name on its own line with a quiet subtitle under it, and the node's actions in
 * one ⋯ menu (grid / list, delete…) instead of a row of small buttons. Double-click the name to rename it.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HEAD, HEAD_ICON, HEAD_MORE, HEAD_SUB, HEAD_TEXT, HEAD_TITLE } from './card';
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu';
import { Icon, type IconName } from './LayerRow';
import { NO_CANVAS } from './pinch';


export function NodeHead(props: {
  icon: IconName;
  title: string;
  sub?: ReactNode;
  /** Renames on double-click (omit for a fixed name). */
  onRename?: (name: string) => void;
  /** What the rename field starts with (default: the title). */
  renameValue?: string;
  renameLabel?: string;
  /** The ⋯ menu; none or empty: no menu. */
  menu?: MenuItem[];
  menuLabel?: string;
  /** Marks or badges at the right, before the menu (hidden, from library, health…). */
  extra?: ReactNode;
  /** The card kind's header colour, as a class setting `--head` (e.g. `[--head:var(--head-preview)]`); assets by default. */
  tone?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.title);
  const [open, setOpen] = useState<MenuState | null>(null);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== (props.renameValue ?? props.title)) props.onRename?.(draft.trim());
  };
  return (
    <div className={`${HEAD} ${props.tone ?? '[--head:var(--head-asset)]'}`}>
      <span className={HEAD_ICON} aria-hidden="true">
        <Icon name={props.icon} size={15} />
      </span>
      <div className={HEAD_TEXT}>
        {editing ? (
          <input
            className={`sc-rename flex-1 ${NO_CANVAS}`}
            aria-label={props.renameLabel ?? 'Name'}
            value={draft}
            autoFocus
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setEditing(false))}
          />
        ) : (
          <div
            className={HEAD_TITLE}
            title={props.onRename ? `${props.title} — double-click to rename` : props.title}
            onDoubleClick={() => props.onRename && (setDraft(props.renameValue ?? props.title), setEditing(true))}
          >
            {props.title}
          </div>
        )}
        {props.sub && <div className={HEAD_SUB}>{props.sub}</div>}
      </div>
      {props.extra}
      {props.menu && props.menu.length > 0 && (
        <button
          type="button"
          className={`${HEAD_MORE} ${NO_CANVAS}`}
          aria-label={props.menuLabel ?? `${props.title} actions`}
          aria-haspopup="menu"
          aria-expanded={Boolean(open)}
          title="More"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setOpen(open ? null : { x: r.right - 200, y: r.bottom + 6, title: props.title, items: props.menu ?? [] });
          }}
        >
          <Icon name="more" />
        </button>
      )}
      {/* Outside the node's transform, so the menu keeps its size at any zoom. */}
      {open && createPortal(<ContextMenu menu={open} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}

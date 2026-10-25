/**
 * V1 (2026-10-25, owner: "smart trigger for those to appear when need to replace or delete any asset in each slot"):
 * one picture slot, the same on every asset node. The picture sits contained in its tile with room around it; its
 * actions — Replace, Remove picture (the slot and its place in every layout stay) and Delete slot — float over the
 * tile only on hover or keyboard focus, and on touch once the slot is tapped (selected). An empty slot is one
 * "Add" target: click it or drop a file on it.
 */
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

export interface SlotProps {
  /** Shown above the tile (Khmer, Vertical…); none for a grid of pictures. */
  caption?: ReactNode;
  /** The picture's URL; null when the slot is empty. */
  src: string | null;
  alt: string;
  /** Uploading into this slot. */
  busy?: boolean;
  /** Selected (its actions stay shown, and the inspector shows it). */
  focused?: boolean;
  /** Used in every layout's draw (a hidden layer shows faded). */
  dimmed?: boolean;
  readOnly?: boolean;
  accept: string;
  /** Accessible names. */
  names: { select: string; file: string; remove?: string; delete?: string };
  onSelect?: () => void;
  onFile: (file: File) => void;
  /** Clears the picture, keeping the slot. */
  onRemovePicture?: () => void;
  /** Deletes the slot (its layer) itself. */
  onDelete?: () => void;
  /** What an empty tile says. */
  emptyText?: string;
  /** Wide (headlines, backgrounds) or square (a grid of pictures). */
  shape?: 'wide' | 'square';
  /** A row in a list: the name beside a small tile. */
  label?: string;
  className?: string;
  /** Drag to reorder (the grid's own handlers). */
  itemProps?: Record<string, unknown>;
}

export function Slot(p: SlotProps) {
  const fileId = useId();
  const [over, setOver] = useState(false);
  const drop = p.readOnly
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          const file = e.dataTransfer.files[0];
          setOver(false);
          if (!file) return;
          e.preventDefault();
          e.stopPropagation();
          p.onFile(file);
        },
      };
  const empty = !p.src;
  const cls = [
    'sc-slot',
    `sc-slot--${p.shape ?? 'square'}`,
    empty && 'sc-slot--empty',
    p.focused && 'sc-slot--focus',
    p.dimmed && 'sc-slot--dimmed',
    over && 'sc-slot--over',
    p.label !== undefined && 'sc-slot--row',
    p.className,
  ]
    .filter(Boolean)
    .join(' ');
  const picture = p.busy ? (
    <span className="sc-slot__state">
      <span className="sc-spinner" aria-hidden="true" />
      Uploading…
    </span>
  ) : p.src ? (
    <img src={p.src} alt={p.alt} draggable={false} />
  ) : (
    <span className="sc-slot__state">
      <Icon name={p.readOnly ? 'image' : 'plus'} size={18} />
      {p.emptyText ?? (p.readOnly ? 'Empty' : 'Add')}
    </span>
  );
  return (
    <div className={cls} {...drop} {...p.itemProps}>
      {p.caption && <span className="sc-slot__caption">{p.caption}</span>}
      <div className="sc-slot__tile">
        {empty && !p.readOnly ? (
          // An empty slot: the whole tile picks a file (and selects the slot, for the inspector).
          <label htmlFor={fileId} className={`sc-slot__pick ${NO_CANVAS}`} onClick={p.onSelect}>
            {picture}
          </label>
        ) : (
          <button type="button" className={`sc-slot__pick ${NO_CANVAS}`} aria-label={p.names.select} onClick={p.onSelect}>
            {picture}
          </button>
        )}
        {!p.readOnly && (
          <div className={`sc-slot__actions ${NO_CANVAS}`}>
            <label className="sc-slot__act" htmlFor={fileId} title={empty ? 'Add a picture' : 'Replace (keeps its place in every layout)'}>
              <Icon name={empty ? 'plus' : 'replace'} size={14} />
            </label>
            {!empty && p.onRemovePicture && (
              <button type="button" className="sc-slot__act" aria-label={p.names.remove} title="Remove picture (keeps the slot)" onClick={p.onRemovePicture}>
                <Icon name="eraser" size={14} />
              </button>
            )}
            {p.onDelete && (
              <button type="button" className="sc-slot__act sc-slot__act--danger" aria-label={p.names.delete} title="Delete slot" onClick={p.onDelete}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {p.label !== undefined && <span className="sc-slot__label">{p.label}</span>}
      {!p.readOnly && (
        <input
          id={fileId}
          type="file"
          accept={p.accept}
          aria-label={p.names.file}
          hidden
          disabled={p.busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) p.onFile(file);
          }}
        />
      )}
    </div>
  );
}

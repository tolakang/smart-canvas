/**
 * V1 (2026-10-25, owner: "smart trigger for those to appear when need to replace or delete any asset in each slot"):
 * one picture slot, the same on every asset node. The picture sits contained in its tile with room around it; its
 * actions — Replace, Remove picture (the slot and its place in every layout stay) and Delete slot — float over the
 * tile only on hover or keyboard focus, and on touch once the slot is tapped (selected). An empty slot is one
 * "Add" target: click it or drop a file on it.
 * D67 (UX B8, amends V1): an empty slot's bar has Delete only (the tile is its Add), and on touch the selected slot's
 * bar sits under its tile instead of over it.
 */
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from './LayerRow';
import { NO_CANVAS } from './pinch';
import { FILE_PICK } from '../ui/file-pick';


/** A soft checkerboard under the picture (transparent pixels show as such). */
const CHECKER = '[background:repeating-conic-gradient(color-mix(in_srgb,var(--checker-a)_70%,transparent)_0_25%,transparent_0_50%)_0_0/14px_14px,var(--surface-2)]';
const RING_3 = '[box-shadow:0_0_0_3px_var(--ring)]';
const RING_4 = '[box-shadow:0_0_0_4px_var(--ring)]';
const ACCENT_FILL = '[background:color-mix(in_srgb,var(--accent-soft)_70%,transparent)]';
/** An action over the tile (Replace, Remove picture, Delete slot). */
const ACT =
  'sc-slot__act grid size-28 flex-none cursor-pointer place-items-center rounded-[8px] bg-transparent p-0 text-fg [border:0] [transition:background_var(--t-fast),color_var(--t-fast)] pointer-coarse:size-38';
const ACT_PLAIN = `${ACT} hover:bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]`;
const ACT_DANGER = `${ACT} sc-slot__act--danger hover:bg-danger-soft hover:text-danger`;

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
  /** V4, a Headline language: the one in use stands out (accent outline and caption), the other steps back. */
  use?: 'in-use' | 'off';
  /** The tile's own shape, where it has one (a Background slot). */
  tileClass?: string;
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
  const row = p.label !== undefined;
  const inUse = p.use === 'in-use';
  const cls = [
    'sc-slot group/slot relative grid min-w-0',
    `sc-slot--${p.shape ?? 'square'}`,
    empty && 'sc-slot--empty',
    p.focused && 'sc-slot--focus',
    p.dimmed && 'sc-slot--dimmed',
    over && 'sc-slot--over',
    p.use && `sc-slot--${p.use}`,
    row
      ? `sc-slot--row grid-cols-[52px_minmax(0,1fr)] items-center gap-12 rounded-[14px] p-6 [transition:background_var(--t-fast)] hover:bg-surface-2 ${p.focused ? ' bg-surface-2' : ''}`
      : 'gap-8',
    p.className,
  ]
    .filter(Boolean)
    .join(' ');
  // The tile's outline: the language in use is always accent; otherwise a dragged file, the selection or (empty) a hover.
  const lit = p.focused || over;
  const tile = [
    'sc-slot__tile overflow-hidden [transition:border-color_var(--t-fast),box-shadow_var(--t-fast),background_var(--t-fast)]',
    row ? 'static size-52 rounded-[11px]' : `relative rounded-[14px] ${p.tileClass ?? (p.shape === 'wide' ? 'h-104' : 'aspect-square')}`,
    inUse
      ? 'border-2 border-solid border-accent'
      : empty
        ? `border-[1.5px] ${over ? 'border-solid' : 'border-dashed'} ${lit ? 'border-accent' : 'border-muted group-hover/slot:border-accent'}`
        : `border border-solid ${lit ? 'border-accent' : 'border-[color-mix(in_srgb,var(--line)_90%,transparent)]'}`,
    inUse || (over && !p.focused) ? RING_4 : p.focused ? RING_3 : '',
    over ? ACCENT_FILL : empty ? '[background:transparent] group-hover/slot:[background:color-mix(in_srgb,var(--accent-soft)_70%,transparent)]' : CHECKER,
    p.dimmed && 'opacity-45',
  ]
    .filter(Boolean)
    .join(' ');
  const pick = `sc-slot__pick grid size-full cursor-pointer [grid-template:minmax(0,1fr)/minmax(0,1fr)] place-items-center rounded-[inherit] [border:0] [background:none] [color:inherit] focus-visible:outline-offset-[-3px] ${row ? 'p-5' : 'p-8'} ${NO_CANVAS}`;
  const state = `sc-slot__state grid justify-items-center gap-6 text-center text-[12px] font-[600] ${over ? 'text-accent' : empty ? 'text-muted group-hover/slot:text-accent' : 'text-muted'}`;
  // Shown on hover or keyboard focus, and on touch once the slot is tapped (a touch hover alone doesn't show them).
  const shown = 'opacity-100 [transform:none] pointer-events-auto';
  const actions = [
    `sc-slot__actions absolute z-2 flex max-w-[calc(100%-12px)] flex-wrap justify-end gap-2 rounded-[11px] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-3 [backdrop-filter:blur(10px)] [box-shadow:0_1px_2px_rgb(16_24_40/0.08),0_6px_16px_-6px_rgb(16_24_40/0.28)] [transition:opacity_var(--t-fast),transform_var(--t-fast)] ${NO_CANVAS}`,
    row ? 'top-[50%] right-8' : p.shape === 'wide' ? 'top-8 right-8' : 'top-6 right-6',
    p.focused
      ? shown
      : `pointer-events-none opacity-0 group-focus-within/slot:opacity-100 group-focus-within/slot:pointer-events-auto group-hover/slot:opacity-100 group-hover/slot:pointer-events-auto [@media(hover:none)]:group-hover/slot:opacity-0 [@media(hover:none)]:group-hover/slot:pointer-events-none ${row ? '' : 'group-focus-within/slot:[transform:none] group-hover/slot:[transform:none]'}`,
    row ? '[transform:translateY(-50%)]' : p.focused ? '' : '[transform:translateY(-3px)_scale(0.96)]',
    empty && (!p.onDelete ? 'hidden' : !p.focused && 'hidden group-hover/slot:flex'),
    // D67 (UX B8): on touch a selected slot's bar sits under its tile, so it never covers the picture or the tile's Add.
    !row && (p.focused ? 'pointer-coarse:static pointer-coarse:mt-6 pointer-coarse:max-w-none pointer-coarse:justify-center' : 'pointer-coarse:hidden'),
  ]
    .filter(Boolean)
    .join(' ');
  const off = p.use === 'off';
  const img = `block size-full object-contain ${off ? 'opacity-55 [filter:saturate(0.6)] [transition:opacity_var(--t-fast),filter_var(--t-fast)] group-hover/slot:opacity-85 group-hover/slot:[filter:none]' : '[filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.08))]'}`;
  const picture = p.busy ? (
    <span className={state}>
      <span className="sc-spinner" aria-hidden="true" />
      Uploading…
    </span>
  ) : p.src ? (
    <img src={p.src} alt={p.alt} draggable={false} className={img} />
  ) : (
    <span className={state}>
      <Icon name={p.readOnly ? 'image' : 'plus'} size={18} />
      {p.emptyText ?? (p.readOnly ? 'Empty' : 'Add')}
    </span>
  );
  return (
    <div className={cls} {...drop} {...p.itemProps}>
      {p.caption && (
        <span
          className={`sc-slot__caption flex min-h-18 items-center gap-6 text-[12px] font-[600] ${inUse ? "text-accent before:size-7 before:rounded-[50%] before:bg-accent before:[box-shadow:0_0_0_3px_var(--accent-soft)] before:content-['']" : 'text-muted'}`}
        >
          {p.caption}
        </span>
      )}
      <div className={row ? 'contents' : 'sc-slot__frame relative grid'}>
      <div className={tile}>
        {empty && !p.readOnly ? (
          // An empty slot: the whole tile picks a file (and selects the slot, for the inspector).
          <label htmlFor={fileId} className={pick} onClick={p.onSelect} {...FILE_PICK}>
            {picture}
          </label>
        ) : (
          <button type="button" className={pick} aria-label={p.names.select} onClick={p.onSelect}>
            {picture}
          </button>
        )}
      </div>
        {!p.readOnly && (
          <div className={actions}>
            {/* D67 (UX B8): an empty slot's tile is its Add, so its bar has Delete only (two Adds collided on touch). */}
            {!empty && (
              <label className={ACT_PLAIN} htmlFor={fileId} title="Replace (keeps its place in every layout)" aria-label="Replace picture" {...FILE_PICK}>
                <Icon name="replace" size={14} />
              </label>
            )}
            {!empty && p.onRemovePicture && (
              <button type="button" className={ACT_PLAIN} aria-label={p.names.remove} title="Remove picture (keeps the slot)" onClick={p.onRemovePicture}>
                <Icon name="eraser" size={14} />
              </button>
            )}
            {p.onDelete && (
              <button type="button" className={ACT_DANGER} aria-label={p.names.delete} title="Delete slot" onClick={p.onDelete}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {row && <span className="sc-slot__label overflow-hidden text-[13px] font-[550] text-ellipsis whitespace-nowrap">{p.label}</span>}
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

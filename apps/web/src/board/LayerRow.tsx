/**
 * The layer row pieces shared by the main node's port list and the editor's Layers panel (T8.1): a thumbnail,
 * drag & drop re-ordering (the row dropped on takes that port, D11), and the row actions — show/hide,
 * duplicate (+) and delete (trash). Port 0 = front = top row.
 */
import { deleteSource, duplicateSource, fillToCss, LIMITS, MAIN, moveSourceToPort, setSourceLocked, setSourceVisible, type InputSource } from '@smart-canvas/core';
import { useState, type DragEvent, type ReactNode } from 'react';
import { assetUrl } from '../api';
import { useBoard } from './context';
import { newId } from './ids';

const DRAG_TYPE = 'application/x-sc-source';

/** Small preview of what the input holds: its image, a fill swatch or the first letters of its text. */
export function LayerThumb({ source }: { source: InputSource }) {
  const { teamId } = useBoard();
  const { content } = source;
  let inner: ReactNode = null;
  if (content.kind === 'fill') inner = <span className="sc-thumb-fill" style={{ background: fillToCss(content.fill) }} />;
  else if (content.kind === 'text') inner = <span className="sc-thumb-text">{firstGrapheme(content.text) || 'T'}</span>;
  else if (content.assetId) inner = <img src={assetUrl(teamId, content.assetId)} alt="" draggable={false} />;
  return (
    <span className="sc-layer-thumb" aria-hidden="true">
      {inner}
    </span>
  );
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** The first whole character (a Khmer cluster stays whole). */
const firstGrapheme = (text: string) => graphemes.segment(text.trim())[Symbol.iterator]().next().value?.segment ?? '';

/** Drag & drop re-ordering for a list of layer rows. */
export function useLayerReorder(compositionId: string = MAIN) {
  const { run, readOnly } = useBoard();
  const [dropAt, setDropAt] = useState<number | null>(null);
  const rowProps = (source: { id: string; port: number }) => ({
    draggable: !readOnly,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, source.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent) => {
      if (readOnly || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropAt(source.port);
    },
    onDragLeave: () => setDropAt(null),
    onDragEnd: () => setDropAt(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropAt(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id && id !== source.id) run((doc) => moveSourceToPort(doc, id, source.port, compositionId));
    },
  });
  return { dropAt, rowProps };
}

/** Eye, lock, duplicate (+) and delete for one layer. */
export function LayerActions({ source }: { source: InputSource }) {
  const { run, doc } = useBoard();
  const full = doc.sources.length >= LIMITS.maxSources;
  return (
    <>
      <button
        type="button"
        aria-label={`${source.visible ? 'Hide' : 'Show'} layer ${source.label}`}
        aria-pressed={!source.visible}
        title={source.visible ? 'Hide' : 'Show'}
        onClick={() => run((d) => setSourceVisible(d, source.id, !source.visible))}
      >
        <Icon name={source.visible ? 'eye' : 'eye-off'} />
      </button>
      {/* D50: locked layers can't be picked, moved or deleted on the canvas, in any of the three layouts. */}
      <button
        type="button"
        aria-label={`${source.locked ? 'Unlock' : 'Lock'} layer ${source.label}`}
        aria-pressed={!!source.locked}
        title={source.locked ? 'Unlock' : 'Lock'}
        onClick={() => run((d) => setSourceLocked(d, source.id, !source.locked))}
      >
        <Icon name={source.locked ? 'lock' : 'unlock'} />
      </button>
      <button
        type="button"
        aria-label={`Duplicate ${source.label}`}
        title={full ? `${LIMITS.maxSources} inputs max` : 'Duplicate'}
        disabled={full}
        onClick={() => run((d) => duplicateSource(d, source.id, newId()))}
      >
        <Icon name="plus" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${source.label}`}
        title="Delete"
        onClick={() => confirmDelete(source.label) && run((d) => deleteSource(d, source.id))}
      >
        <Icon name="trash" />
      </button>
    </>
  );
}

/** The one confirm before deleting an input (row trash, node header, right-click menu). */
export const confirmDelete = (label: string) => window.confirm(`Delete input "${label}"? Its wires and edits on Previews go with it.`);

/** A rounded rectangle as path data (the filled icons are built from these). */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
const dot = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0z`;

/**
 * V1 (2026-10-25, owner: "modern solid icons"): a 16 px set. `f` is filled (glyphs with a body: bin, picture,
 * eye, lock…), `s` is a bold rounded stroke (line glyphs: ×, +, ✓, arrows). Some use both.
 */
const ICONS = {
  eye: { f: 'M8 3C3.6 3 1 8 1 8s2.6 5 7 5 7-5 7-5-2.6-5-7-5zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z' + dot(8, 8, 1.3) },
  'eye-off': { s: 'M2.5 2.5l11 11M6.4 3.4A6.6 6.6 0 0 1 8 3.2c4.3 0 6.8 4.8 6.8 4.8a11.6 11.6 0 0 1-2.1 2.7M4.3 5A11.8 11.8 0 0 0 1.2 8s2.5 4.8 6.8 4.8c1 0 1.9-.2 2.7-.6' },
  plus: { s: 'M8 3.25v9.5M3.25 8h9.5' },
  minus: { s: 'M3.25 8h9.5' },
  trash: { f: 'M6.5 1.25h3a1 1 0 0 1 1 1V3h3.25a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H5.5v-.75a1 1 0 0 1 1-1zM3.4 5.6h9.2l-.68 8.05A1.5 1.5 0 0 1 10.43 15H5.57a1.5 1.5 0 0 1-1.49-1.35z' },
  grip: { f: dot(6, 4, 1.25) + dot(10, 4, 1.25) + dot(6, 8, 1.25) + dot(10, 8, 1.25) + dot(6, 12, 1.25) + dot(10, 12, 1.25) },
  pencil: { f: 'M11.2 1.8a1.6 1.6 0 0 1 2.25 0l.75.75a1.6 1.6 0 0 1 0 2.25L5.6 13.4 1.75 14.25l.85-3.85z' },
  library: { f: 'M4.5 1.5h7A1.5 1.5 0 0 1 13 3v11.25a.5.5 0 0 1-.78.42L8 11.9l-4.22 2.77A.5.5 0 0 1 3 14.25V3a1.5 1.5 0 0 1 1.5-1.5z' },
  check: { s: 'M3.25 8.5l3 3 6.5-7' },
  close: { s: 'M4 4l8 8M12 4l-8 8' },
  back: { s: 'M10 3.25L5.25 8 10 12.75' },
  undo: { s: 'M5.5 3.5l-3 3 3 3M2.75 6.5h6.75a4 4 0 0 1 0 8H7' },
  redo: { s: 'M10.5 3.5l3 3-3 3M13.25 6.5H6.5a4 4 0 0 0 0 8H9' },
  /** Replace a picture: two arrows turning. */
  replace: { s: 'M13 6.25A5.2 5.2 0 0 0 3.7 4.6M3 9.75a5.2 5.2 0 0 0 9.3 1.65M3.4 2.25v2.6H6M12.6 13.75v-2.6H10' },
  /** Remove a picture but keep its slot. */
  eraser: { f: 'M9.2 2.2a1.6 1.6 0 0 1 2.26 0l2.34 2.34a1.6 1.6 0 0 1 0 2.26L8.35 12.25h4.9a.75.75 0 0 1 0 1.5H5.6a1.6 1.6 0 0 1-1.13-.47L2.2 11.01a1.6 1.6 0 0 1 0-2.26zM4.6 8.4L3.26 9.75 5.85 12.3h1.4l1.06-1.06z' },
  font: { s: 'M3 13L7 3h2l4 10M5 9.5h6' },
  export: { f: 'M2.75 9.25a.75.75 0 0 1 .75.75v2.5h9V10a.75.75 0 0 1 1.5 0v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a.75.75 0 0 1 .75-.75zM8 1.5l3.6 3.6-1.06 1.06-1.79-1.79V10h-1.5V4.37L5.46 6.16 4.4 5.1z' },
  image: { f: 'M3 1.75h10A1.25 1.25 0 0 1 14.25 3v10A1.25 1.25 0 0 1 13 14.25H3A1.25 1.25 0 0 1 1.75 13V3A1.25 1.25 0 0 1 3 1.75zM3.25 3.25v9.5h9.5v-9.5zM3.75 12l3-3.9 2.2 2.6 1.5-1.6 1.8 2.9z' + dot(10.4, 5.6, 1.2) },
  vector: { f: 'M8 1.5l6 6.5-6 6.5-6-6.5z' },
  text: { s: 'M3.5 4.25V3h9v1.25M8 3v10M6 13h4' },
  fill: { f: rr(2, 2.5, 12, 11, 2) },
  preview: { f: 'M3 1.75h10A1.25 1.25 0 0 1 14.25 3v10A1.25 1.25 0 0 1 13 14.25H3A1.25 1.25 0 0 1 1.75 13V3A1.25 1.25 0 0 1 3 1.75zm1.5 3v4h7v-4zm0 6v1.5h7v-1.5z' },
  output: { f: 'M4 1.5h8A1.5 1.5 0 0 1 13.5 3v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13V3A1.5 1.5 0 0 1 4 1.5zm1.75 4v1.25h4.5V5.5zm0 3v1.25h4.5V8.5z' },
  cursor: { f: 'M3.4 1.9a.6.6 0 0 1 .87-.68l9.1 5.25a.6.6 0 0 1-.13 1.1l-3.9 1.05-1.95 3.9a.6.6 0 0 1-1.12-.17z' },
  hand: { s: 'M5.5 8V4a1 1 0 0 1 2 0v3.5M7.5 3.5v-1a1 1 0 0 1 2 0V7.5M9.5 4a1 1 0 0 1 2 0v4M11.5 6a1 1 0 0 1 2 0v3.5A4.5 4.5 0 0 1 9 14H8.5a4 4 0 0 1-3.2-1.6L3 9.5a1 1 0 0 1 1.6-1.2L5.5 9.5' },
  marquee: { s: 'M2 5V2h3M7 2h2M11 2h3v3M14 7v2M14 11v3h-3M9 14H7M5 14H2v-3M2 9V7' },
  list: { f: dot(3, 4, 1.25) + dot(3, 8, 1.25) + dot(3, 12, 1.25) + rr(5.75, 3.25, 8.5, 1.5, 0.75) + rr(5.75, 7.25, 8.5, 1.5, 0.75) + rr(5.75, 11.25, 8.5, 1.5, 0.75) },
  grid: { f: rr(2, 2, 5.25, 5.25, 1.4) + rr(8.75, 2, 5.25, 5.25, 1.4) + rr(2, 8.75, 5.25, 5.25, 1.4) + rr(8.75, 8.75, 5.25, 5.25, 1.4) },
  fit: { s: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10' },
  arrange: { s: 'M2.5 2.5v11', f: rr(4.75, 3, 9, 3.5, 1) + rr(4.75, 9.5, 6, 3.5, 1) },
  map: { f: 'M1.75 3.9l3.75-1.6v10.3l-3.05 1.3a.5.5 0 0 1-.7-.46zM6.75 2.3l2.5 1.1v10.3l-2.5-1.1zM10.5 3.4l3.05-1.3a.5.5 0 0 1 .7.46v9.54l-3.75 1.6z' },
  sun: { f: dot(8, 8, 2.9), s: 'M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9' },
  moon: { f: 'M13.7 9.6A5.8 5.8 0 0 1 6.4 2.3a.5.5 0 0 0-.66-.6 6.5 6.5 0 1 0 8.56 8.56.5.5 0 0 0-.6-.66z' },
  more: { f: dot(3.25, 8, 1.5) + dot(8, 8, 1.5) + dot(12.75, 8, 1.5) },
  history: { s: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5V5H5M8 5v3l2 1.5' },
  search: { s: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6L14 14' },
  panel: { f: 'M3 1.75h10A1.25 1.25 0 0 1 14.25 3v10A1.25 1.25 0 0 1 13 14.25H3A1.25 1.25 0 0 1 1.75 13V3A1.25 1.25 0 0 1 3 1.75zM3.25 3.25v9.5h5.5v-9.5z' },
  crop: { s: 'M4.5 1.5v10h10M1.5 4.5h10v10' },
  adjust: { f: 'M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM8 3v10a5 5 0 0 0 0-10z' },
  flip: { s: 'M8 1.5v13', f: 'M6.25 4v8.5H2.5zM9.75 4l3.75 8.5H9.75z' },
  lock: { f: rr(2.75, 7, 10.5, 7.5, 1.6) + 'M5 7V5a3 3 0 0 1 6 0v2H9.5V5a1.5 1.5 0 0 0-3 0v2z' },
  unlock: { f: rr(2.75, 7, 10.5, 7.5, 1.6) + 'M5 7V5a3 3 0 0 1 5.85-.94l-1.42.47A1.5 1.5 0 0 0 6.5 5v2z' },
  comment: { f: 'M3 2h10a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 13 11.5H8.2l-3.4 2.7a.5.5 0 0 1-.8-.4v-2.3H3A1.5 1.5 0 0 1 1.5 10V3.5A1.5 1.5 0 0 1 3 2z' },
} satisfies Record<string, { f?: string; s?: string }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const icon: { f?: string; s?: string } = ICONS[name];
  return (
    <svg className={`sc-icon sc-icon--${name}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {icon.f && <path d={icon.f} fill="currentColor" fillRule="evenodd" />}
      {icon.s && <path d={icon.s} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

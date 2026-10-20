/**
 * The layer row pieces shared by the main node's port list and the editor's Layers panel (T8.1): a thumbnail,
 * drag & drop re-ordering (the row dropped on takes that port, D11), and the row actions — show/hide,
 * duplicate (+) and delete (trash). Port 0 = front = top row.
 */
import { deleteSource, duplicateSource, fillToCss, LIMITS, MAIN, moveSourceToPort, removeRow, setSourceVisible, type InputSource } from '@smart-canvas/core';
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

/** Eye, duplicate (+) and delete for one layer. */
/** On a composition other than main (T12.3), the trash takes the row out of that preview; the input stays. */
export function LayerActions({ source, compositionId = MAIN }: { source: InputSource; compositionId?: string }) {
  const { run, doc } = useBoard();
  const rowOnly = compositionId !== MAIN;
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
        aria-label={rowOnly ? `Remove ${source.label} from this preview` : `Delete ${source.label}`}
        title={rowOnly ? 'Remove from this preview' : 'Delete'}
        onClick={() => {
          if (rowOnly) run((d) => removeRow(d, compositionId, source.id));
          else if (confirmDelete(source.label)) run((d) => deleteSource(d, source.id));
        }}
      >
        <Icon name="trash" />
      </button>
    </>
  );
}

/** The one confirm before deleting an input (row trash, node header, right-click menu). */
export const confirmDelete = (label: string) => window.confirm(`Delete input "${label}"? Its wires and output overrides go with it.`);

const PATHS = {
  eye: 'M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zm7 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  'eye-off': 'M2 2l12 12M6.3 3.3A7 7 0 0 1 8 3c4.5 0 7 5 7 5a12 12 0 0 1-2 2.6M4 4.9A12 12 0 0 0 1 8s2.5 5 7 5a7 7 0 0 0 3-.7',
  plus: 'M8 3v10M3 8h10',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M7 7v4M9 7v4',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  pencil: 'M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3',
  library: 'M4 2.5h8v11l-4-2.5-4 2.5z',
  check: 'M3 8.5l3 3 7-7',
  close: 'M4 4l8 8M12 4l-8 8',
  back: 'M10 3L5 8l5 5',
  undo: 'M5.5 3.5L2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H7',
  redo: 'M10.5 3.5l3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H9',
  font: 'M3 13L7 3h2l4 10M5 9.5h6',
  export: 'M8 10V2.5M5 5.5l3-3 3 3M3 10v3.5h10V10',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6a.5.5 0 1 0 0-.01',
  vector: 'M8 2l5.5 6L8 14 2.5 8zM8 2v12',
  text: 'M3.5 4V3h9v1M8 3v10M6 13h4',
  fill: 'M2.5 3.5h11v9h-11zM2.5 12.5l11-9',
  preview: 'M2.5 2.5h11v11h-11zM5 5h6v4H5zM5 11h6',
  output: 'M3.5 2.5h9v11h-9zM6 6h4M6 8.5h4',
  cursor: 'M4 2.5l8 5-3.5 1-2 4z',
  hand: 'M5.5 8V4a1 1 0 0 1 2 0v3.5M7.5 3.5v-1a1 1 0 0 1 2 0V7.5M9.5 4a1 1 0 0 1 2 0v4M11.5 6a1 1 0 0 1 2 0v3.5A4.5 4.5 0 0 1 9 14H8.5a4 4 0 0 1-3.2-1.6L3 9.5a1 1 0 0 1 1.6-1.2L5.5 9.5',
  minus: 'M3 8h10',
  fit: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  grid: 'M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11',
  map: 'M2.5 4l3.5-1.5 4 1.5 3.5-1.5v9.5L10 13.5 6 12l-3.5 1.5zM6 2.5V12M10 4v9.5',
  sun: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
  moon: 'M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z',
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className={`sc-icon sc-icon--${name}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={name === 'grip' ? 2.4 : 1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

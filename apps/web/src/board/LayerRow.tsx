/**
 * The layer row pieces shared by the main node's port list and the editor's Layers panel (T8.1): a thumbnail,
 * drag & drop re-ordering (the row dropped on takes that port, D11), and the row actions — show/hide,
 * duplicate (+) and delete (trash). Port 0 = front = top row.
 */
import { deleteSource, duplicateSource, fillToCss, LIMITS, moveSourceToPort, setSourceVisible, type InputSource } from '@smart-canvas/core';
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
export function useLayerReorder() {
  const { run, readOnly } = useBoard();
  const [dropAt, setDropAt] = useState<number | null>(null);
  const rowProps = (source: Pick<InputSource, 'id' | 'port'>) => ({
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
      if (id && id !== source.id) run((doc) => moveSourceToPort(doc, id, source.port));
    },
  });
  return { dropAt, rowProps };
}

/** Eye, duplicate (+) and delete for one layer. */
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
        onClick={() => {
          if (confirmDelete(source.label)) run((d) => deleteSource(d, source.id));
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
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className={`sc-icon sc-icon--${name}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={name === 'grip' ? 2.4 : 1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

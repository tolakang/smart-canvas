/**
 * Left node library (T13.4, D33): everything that can go on the board — inputs, a main preview, output
 * presets and the team library's saved items — with a search. Drag an item onto the canvas to place it there,
 * or click it to add it in the middle of the view (touch, keyboard). Collapses to a slim rail (remembered).
 * On tablets and phones (T13.6, D33) it floats instead — an overlay or a bottom sheet — and closes with `onClose`.
 */
import { fillToCss, LIMITS, type LibraryItem, type SizePreset } from '@smart-canvas/core';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { api, assetUrl } from '../api';
import type { NewInput } from './AddInputDialog';
import { useBoard } from './context';
import { Icon } from './LayerRow';

/** What a library item adds. */
export type AddSpec =
  | { type: 'input'; input: NewInput }
  | { type: 'composition' }
  | { type: 'output'; preset: SizePreset | null }
  | { type: 'library'; item: LibraryItem };

/** Drag payload type: dropping it on the canvas adds the spec there (Board). */
export const ADD_DRAG_TYPE = 'application/x-sc-add';

const INPUTS: { label: string; hint: string; input: NewInput; icon: 'image' | 'vector' | 'text' | 'fill' }[] = [
  { label: 'Image', hint: 'Photo or picture · subject', input: { kind: 'image', label: 'Image', behavesLike: 'subject' }, icon: 'image' },
  { label: 'Logo / SVG', hint: 'Vector · logo', input: { kind: 'vector', label: 'Logo', behavesLike: 'logo' }, icon: 'vector' },
  { label: 'Text', hint: 'Headline or copy', input: { kind: 'text', label: 'Text', behavesLike: 'text' }, icon: 'text' },
  { label: 'Background colour / gradient', hint: 'Fills every output', input: { kind: 'fill', label: 'Background', behavesLike: 'background' }, icon: 'fill' },
];

const COLLAPSE_KEY = 'sc-library-collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export function NodeLibrary({ onAdd, floating, onClose }: { onAdd: (spec: AddSpec) => void; floating?: 'overlay' | 'sheet'; onClose?: () => void }) {
  const { teamId, readOnly, presets, doc } = useBoard();
  const [stored, setCollapsed] = useState(readCollapsed);
  const collapsed = stored && !floating;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  useEffect(() => {
    if (collapsed) return;
    let live = true;
    api<LibraryItem[]>('GET', `/teams/${teamId}/library`).then(
      (l) => live && setItems(l),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [teamId, collapsed]);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // private mode: remembered for this page only
      }
      return !c;
    });

  if (readOnly) return null;
  if (collapsed)
    return (
      <aside className="sc-library sc-library--collapsed" aria-label="Node library">
        <button type="button" className="sc-library__rail" onClick={toggle} aria-label="Show node library" title="Show node library">
          <Icon name="plus" />
        </button>
      </aside>
    );

  const q = query.trim().toLowerCase();
  const match = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));
  const inputsFull = doc.sources.length >= LIMITS.maxSources;
  const outputsFull = doc.outputs.length >= LIMITS.maxOutputs;
  const compsFull = doc.compositions.length >= LIMITS.maxCompositions;
  const inputs = INPUTS.filter((i) => match(i.label, i.hint));
  const shownPresets = presets.filter((p) => match(p.name, `${p.size.width}×${p.size.height}`, p.group));
  const libraryItems = items.filter((i) => match(i.name, ...i.tags));

  return (
    <aside className={`sc-library${floating ? ` sc-floating sc-floating--${floating} sc-floating--start` : ''}`} aria-label="Node library">
      <div className="sc-library__head">
        <input className="sc-library__search" type="search" placeholder="Search nodes…" aria-label="Search nodes" value={query} onChange={(e) => setQuery(e.target.value)} />
        {floating ? (
          <button type="button" className="sc-icon-btn" onClick={onClose} aria-label="Close node library" title="Close">
            <Icon name="close" />
          </button>
        ) : (
          <button type="button" className="sc-icon-btn" onClick={toggle} aria-label="Hide node library" title="Hide node library">
            <Icon name="back" />
          </button>
        )}
      </div>
      <div className="sc-library__body">
        {inputs.length > 0 && (
          <Group title="Inputs" note={inputsFull ? `${LIMITS.maxSources} max` : undefined}>
            {inputs.map((i) => (
              <Item key={i.label} spec={{ type: 'input', input: i.input }} label={i.label} hint={i.hint} icon={<span className="sc-library__glyph"><Icon name={i.icon} /></span>} disabled={inputsFull} onAdd={onAdd} />
            ))}
          </Group>
        )}
        {match('Main preview', 'composition', 'variant') && (
          <Group title="Main previews" note={compsFull ? `${LIMITS.maxCompositions} max` : undefined}>
            <Item spec={{ type: 'composition' }} label="Main preview" hint="Another artboard, e.g. a campaign variant" icon={<span className="sc-library__glyph sc-library__glyph--main"><Icon name="preview" /></span>} disabled={compsFull} onAdd={onAdd} />
          </Group>
        )}
        {(shownPresets.length > 0 || match('Custom size', 'output')) && (
          <Group title="Outputs" note={outputsFull ? `${LIMITS.maxOutputs} max` : undefined}>
            {match('Custom size', 'output') && (
              <Item spec={{ type: 'output', preset: null }} label="Custom size…" hint="Type a size in px or mm" icon={<span className="sc-library__glyph sc-library__glyph--out"><Icon name="output" /></span>} disabled={outputsFull} onAdd={onAdd} />
            )}
            {shownPresets.map((p) => (
              <Item
                key={p.id}
                spec={{ type: 'output', preset: p }}
                label={p.name}
                hint={`${p.size.width}×${p.size.height} ${p.size.unit} · ${p.group}`}
                icon={<span className="sc-library__ratio" style={{ aspectRatio: `${p.size.width} / ${p.size.height}` }} />}
                disabled={outputsFull}
                onAdd={onAdd}
              />
            ))}
          </Group>
        )}
        {libraryItems.length > 0 && (
          <Group title="Team library">
            {libraryItems.map((i) => (
              <Item key={i.id} spec={{ type: 'library', item: i }} label={i.name} hint={`${i.kind} · ${i.behavesLike}`} icon={<LibraryThumb item={i} teamId={teamId} />} disabled={inputsFull} onAdd={onAdd} />
            ))}
          </Group>
        )}
        {q && inputs.length + shownPresets.length + libraryItems.length === 0 && !match('Main preview', 'composition', 'variant', 'Custom size', 'output') && (
          <p className="sc-muted sc-library__empty">Nothing matches “{query}”.</p>
        )}
      </div>
      <p className="sc-muted sc-library__tip">{floating ? 'Tap to add in the middle of the view.' : 'Drag onto the canvas, or click to add in the middle.'}</p>
    </aside>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="sc-library__group" aria-label={title}>
      <h2 className="sc-library__title">
        {title} {note && <span className="sc-muted">· {note}</span>}
      </h2>
      <ul className="sc-library__list">{children}</ul>
    </section>
  );
}

function Item({ spec, label, hint, icon, disabled, onAdd }: { spec: AddSpec; label: string; hint: string; icon: ReactNode; disabled: boolean; onAdd: (s: AddSpec) => void }) {
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(ADD_DRAG_TYPE, JSON.stringify(spec));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <li>
      <button type="button" className="sc-library__item" draggable={!disabled} disabled={disabled} onDragStart={onDragStart} onClick={() => onAdd(spec)} title={`${label}: drag onto the canvas, or click to add`}>
        <span className="sc-library__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="sc-library__text">
          <span>{label}</span>
          <span className="sc-muted">{hint}</span>
        </span>
      </button>
    </li>
  );
}

function LibraryThumb({ item, teamId }: { item: LibraryItem; teamId: string }) {
  const c = item.content;
  if (c.kind === 'fill') return <span className="sc-library__swatch" style={{ background: fillToCss(c.fill) }} />;
  if (c.kind === 'text') return <span className="sc-library__glyph"><Icon name="text" /></span>;
  return c.assetId ? <img className="sc-library__img" src={assetUrl(teamId, c.assetId)} alt="" draggable={false} /> : <span className="sc-library__glyph"><Icon name="vector" /></span>;
}

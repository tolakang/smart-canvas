/**
 * Team library (D14, screen 6; T7.1): the team's saved sources. "Add" puts a detached copy into this
 * project (it remembers its library item); editors can delete items. Saving happens on each input.
 */
import { addSourceFromLibrary, fillToCss, LIMITS, type LibraryItem, type SourceResult, type ProjectDoc } from '@smart-canvas/core';
import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api';
import { newId } from './ids';

const KIND_LABEL = { image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' } as const;

function Preview({ item, teamId }: { item: LibraryItem; teamId: string }) {
  const c = item.content;
  if (c.kind === 'fill') return <span className="sc-lib__swatch" style={{ background: fillToCss(c.fill) }} />;
  if (c.kind === 'text') return <span className="sc-lib__text">{c.text || '—'}</span>;
  return c.assetId ? <img className="sc-lib__img" src={assetUrl(teamId, c.assetId)} alt="" /> : <span className="sc-lib__swatch" />;
}

export function LibraryDialog(props: {
  teamId: string;
  readOnly: boolean;
  sourceCount: number;
  run: (op: (doc: ProjectDoc) => SourceResult) => SourceResult;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = `/teams/${props.teamId}/library`;
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let live = true;
    api<LibraryItem[]>('GET', url).then(
      (l) => live && setItems(l),
      () => live && setItems([]),
    );
    return () => {
      live = false;
    };
  }, [url, reload]);

  const q = query.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q)));
  const full = props.sourceCount >= LIMITS.maxSources;

  async function remove(item: LibraryItem) {
    if (!window.confirm(`Delete “${item.name}” from the team library? Projects that use it keep their copy.`)) return;
    await api('DELETE', `${url}/${item.id}`);
    setReload((n) => n + 1);
  }

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="library-title">
      <div className="sc-card sc-lib">
        <h1 id="library-title">Team library</h1>
        <input type="search" placeholder="Search name or tag" aria-label="Search library" value={query} onChange={(e) => setQuery(e.target.value)} />
        {items === null ? (
          <p className="sc-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="sc-muted">{items.length ? 'Nothing matches.' : 'Nothing saved yet. Use 📚 on an input to save it here.'}</p>
        ) : (
          <ul className="sc-list">
            {shown.map((item) => (
              <li key={item.id} data-library-item={item.name}>
                <Preview item={item} teamId={props.teamId} />
                <span className="sc-lib__name">
                  {item.name}
                  <span className="sc-muted">
                    {' '}
                    {KIND_LABEL[item.kind]} · {item.behavesLike}
                    {item.tags.length > 0 && ` · ${item.tags.map((t) => `#${t}`).join(' ')}`}
                  </span>
                </span>
                {!props.readOnly && (
                  <span className="sc-row">
                    <button
                      type="button"
                      disabled={full}
                      title={full ? `${LIMITS.maxSources} inputs max` : undefined}
                      onClick={() => {
                        const r = props.run((d) => addSourceFromLibrary(d, item, newId()));
                        if (r.ok) setAdded(item.name);
                      }}
                    >
                      Add
                    </button>
                    <button type="button" aria-label={`Delete ${item.name} from library`} onClick={() => void remove(item)}>
                      🗑
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {added && (
          <p className="sc-muted" role="status">
            Added “{added}” to this project.
          </p>
        )}
        <div className="sc-row">
          <button type="button" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

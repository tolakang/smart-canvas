/**
 * Layers panel (T3.3): every input in port order (port 0 = front, D11), visibility toggle, re-order,
 * and selection kept in sync with the canvas. Inputs not wired into main are listed greyed with Connect.
 */
import { connectSource, moveSourceToPort, setSourceVisible } from '@smart-canvas/core';
import { useBoard } from '../board/context';

const KIND_LABEL = { image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' } as const;

export function LayersPanel(props: { selected: string | null; onSelect: (id: string) => void }) {
  const { doc, run, readOnly } = useBoard();
  const wired = new Set(doc.wires.filter((w) => w.to === 'main').map((w) => w.from));
  const layers = [...doc.sources].sort((a, b) => a.port - b.port);

  return (
    <aside className="sc-layers" aria-label="Layers">
      <div className="sc-layers__title">
        Layers <span className="sc-muted">front ↑</span>
      </div>
      <ol className="sc-layers__list">
        {layers.map((s, i) => {
          const isWired = wired.has(s.id);
          const isSelected = props.selected === s.id;
          return (
            <li
              key={s.id}
              className={`sc-layer${isSelected ? ' sc-layer--selected' : ''}${s.visible ? '' : ' sc-layer--hidden'}${isWired ? '' : ' sc-layer--unwired'}`}
              aria-selected={isSelected}
              data-layer={s.id}
            >
              <button type="button" className="sc-layer__name" onClick={() => props.onSelect(s.id)}>
                <span>{s.label}</span>
                <span className="sc-muted">
                  {KIND_LABEL[s.kind]} · {s.behavesLike}
                  {!isWired && ' · not wired'}
                </span>
              </button>
              {!readOnly && (
                <span className="sc-layer__actions">
                  <button
                    type="button"
                    aria-label={`${s.visible ? 'Hide' : 'Show'} layer ${s.label}`}
                    aria-pressed={!s.visible}
                    title={s.visible ? 'Hide' : 'Show'}
                    onClick={() => run((d) => setSourceVisible(d, s.id, !s.visible))}
                  >
                    {s.visible ? '◉' : '○'}
                  </button>
                  <button type="button" aria-label={`Bring ${s.label} forward`} disabled={i === 0} onClick={() => run((d) => moveSourceToPort(d, s.id, s.port - 1))}>
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Send ${s.label} back`}
                    disabled={i === layers.length - 1}
                    onClick={() => run((d) => moveSourceToPort(d, s.id, s.port + 1))}
                  >
                    ▼
                  </button>
                  {!isWired && (
                    <button type="button" aria-label={`Connect ${s.label} to main`} onClick={() => run((d) => connectSource(d, s.id))}>
                      +
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

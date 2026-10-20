/**
 * Layers panel (T3.3): every input in port order (port 0 = front, D11), visibility toggle, re-order,
 * and selection kept in sync with the canvas. Inputs not wired into main are listed greyed with Connect.
 * In an output editor (`outputId`, T5.1) the eye hides the layer on that output only (an override);
 * stacking order and wiring stay the master's, so those buttons are not shown.
 */
import { connectSource, moveSourceToPort, setOverrideHidden, setSourceVisible } from '@smart-canvas/core';
import { useBoard } from '../board/context';

const KIND_LABEL = { image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' } as const;

export function LayersPanel(props: { selected: string | null; onSelect: (id: string) => void; outputId?: string }) {
  const { doc, run, readOnly, author } = useBoard();
  const { outputId } = props;
  const overrides = new Map(doc.outputs.find((o) => o.id === outputId)?.overrides.map((o) => [o.sourceId, o]));
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
          const hiddenHere = !!overrides.get(s.id)?.hidden;
          const visible = s.visible && !hiddenHere;
          return (
            <li
              key={s.id}
              className={`sc-layer${isSelected ? ' sc-layer--selected' : ''}${visible ? '' : ' sc-layer--hidden'}${isWired ? '' : ' sc-layer--unwired'}`}
              aria-selected={isSelected}
              data-layer={s.id}
            >
              <button type="button" className="sc-layer__name" onClick={() => props.onSelect(s.id)}>
                <span>{s.label}</span>
                <span className="sc-muted">
                  {KIND_LABEL[s.kind]} · {s.behavesLike}
                  {!isWired && ' · not wired'}
                  {outputId && !s.visible && ' · hidden everywhere'}
                </span>
              </button>
              {!readOnly && outputId && (
                <span className="sc-layer__actions">
                  <button
                    type="button"
                    aria-label={`${hiddenHere ? 'Show' : 'Hide'} layer ${s.label} on this output`}
                    aria-pressed={hiddenHere}
                    title={hiddenHere ? 'Show on this output' : 'Hide on this output'}
                    disabled={!s.visible}
                    onClick={() => run((d) => setOverrideHidden(d, outputId, s.id, !hiddenHere, author()))}
                  >
                    {visible ? '◉' : '○'}
                  </button>
                </span>
              )}
              {!readOnly && !outputId && (
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

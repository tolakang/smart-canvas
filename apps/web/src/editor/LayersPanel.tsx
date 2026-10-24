/**
 * Layers panel (T3.3, T8.1): every input in port order (port 0 = front = top, D11), selection kept in sync
 * with the canvas. In the main editor rows re-order by drag & drop and have show/hide, duplicate (+) and
 * delete; inputs not wired into main are greyed with Connect. In an output editor (`outputId`, T5.1) the eye
 * hides the layer on that output only (an override); stacking order and wiring stay the master's.
 */
import { connectSource, layerOrder, MAIN, outputComposition, setOverrideHidden, wiredLayers, type InputSource } from '@smart-canvas/core';
import { useBoard } from '../board/context';
import { Icon, LayerActions, LayerThumb, useLayerReorder } from '../board/LayerRow';

const KIND_LABEL = { image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' } as const;

export function LayersPanel(props: { selected: string | null; onSelect: (id: string) => void; outputId?: string; compositionId?: string }) {
  const { doc, run, readOnly, author } = useBoard();
  const { outputId } = props;
  // The rows of this editor's composition (an output's: the one it is wired to).
  const compositionId = props.compositionId ?? (outputId ? outputComposition(doc, outputId) : undefined) ?? MAIN;
  const overrides = new Map(doc.outputs.find((o) => o.id === outputId)?.overrides.map((o) => [o.sourceId, o]));
  const wired = wiredLayers(doc, compositionId);
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  const layers = layerOrder(doc, compositionId).flatMap((id, port) => (byId.get(id) ? [{ s: byId.get(id) as InputSource, port }] : []));
  const { dropAt, rowProps } = useLayerReorder(compositionId);
  const reorder = !readOnly && !outputId;

  return (
    <aside className="sc-layers" aria-label="Layers">
      <div className="sc-layers__title">
        Layers <span className="sc-muted">top = front</span>
      </div>
      <ol className="sc-layers__list">
        {layers.map(({ s, port }) => {
          const isWired = wired.has(s.id);
          const isSelected = props.selected === s.id;
          const hiddenHere = !!overrides.get(s.id)?.hidden;
          const visible = s.visible && !hiddenHere;
          return (
            <li
              key={s.id}
              className={`sc-layer${isSelected ? ' sc-layer--selected' : ''}${visible ? '' : ' sc-layer--hidden'}${isWired ? '' : ' sc-layer--unwired'}${dropAt === port ? ' sc-layer--drop' : ''}`}
              aria-selected={isSelected}
              data-layer={s.id}
              {...(reorder ? rowProps({ id: s.id, port }) : {})}
            >
              {reorder && (
                <span className="sc-port__grip" title="Drag to re-order">
                  <Icon name="grip" />
                </span>
              )}
              <LayerThumb source={s} />
              <button type="button" className="sc-layer__name" onClick={() => props.onSelect(s.id)}>
                <span>
                  {s.label}
                  {overrides.has(s.id) && (
                    <span className="sc-edited" title="Edited by hand on this Preview: it no longer follows the automatic layout. Reset it in the properties panel.">
                      edited
                    </span>
                  )}
                </span>
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
                    aria-label={`${hiddenHere ? 'Show' : 'Hide'} layer ${s.label} on this Preview`}
                    aria-pressed={hiddenHere}
                    title={hiddenHere ? 'Show on this Preview' : 'Hide on this Preview'}
                    disabled={!s.visible}
                    onClick={() => run((d) => setOverrideHidden(d, outputId, s.id, !hiddenHere, author()))}
                  >
                    {visible ? '◉' : '○'}
                  </button>
                </span>
              )}
              {reorder && (
                <span className="sc-layer__actions">
                  {!isWired && (
                    <button type="button" aria-label={`Connect ${s.label} to main`} title="Connect to main" onClick={() => run((d) => connectSource(d, s.id, undefined, compositionId))}>
                      ○
                    </button>
                  )}
                  <LayerActions source={s} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

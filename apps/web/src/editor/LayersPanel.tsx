/**
 * Layers panel (T3.3, T8.1): every input in port order (port 0 = front = top, D11), selection kept in sync
 * with the canvas. In the main editor rows re-order by drag & drop and have show/hide, duplicate (+) and
 * delete; inputs not wired into main are greyed with Connect. In an output editor (`outputId`, T5.1) the eye
 * hides the layer on that output only (an override); stacking order and wiring stay the master's.
 * UX B5 (F13): a headline pair is one row (the language in use, with a KM / EN switch; the other language is not
 * drawn, so not listed); a layer with no file or text yet says "empty"; hide and connect use the icon set.
 */
import { connectSource, isEmptyLayer, languagePairs, layerOrder, MAIN, outputComposition, pairRows, setLanguage, setOverrideHidden, unusedLanguageInputs, wiredLayers, type InputSource, type LanguagePair } from '@smart-canvas/core';
import { useBoard } from '../board/context';
import { Icon, KIND_LABEL, LayerActions, LayerThumb, useLayerReorder } from '../board/LayerRow';
import { EDITED, LAYERS, LAYERS_LIST, LAYERS_TITLE, layerActionsClass, layerNameClass, layerRowClass } from './panels';


export function LayersPanel(props: { selected: string | null; onSelect: (id: string) => void; outputId?: string; compositionId?: string }) {
  const { doc, run, readOnly, author, layoutDeps } = useBoard();
  const { outputId } = props;
  // The rows of this editor's composition (an output's: the one it is wired to).
  const compositionId = props.compositionId ?? (outputId ? outputComposition(doc, outputId) : undefined) ?? MAIN;
  const overrides = new Map(doc.outputs.find((o) => o.id === outputId)?.overrides.map((o) => [o.sourceId, o]));
  const wired = wiredLayers(doc, compositionId);
  const byId = new Map(doc.sources.map((s) => [s.id, s]));
  const layers = layerOrder(doc, compositionId).flatMap((id, port) => (byId.get(id) ? [{ s: byId.get(id) as InputSource, port }] : []));
  const { dropAt, rowProps } = useLayerReorder(compositionId);
  const reorder = !readOnly && !outputId;
  const pairOf = new Map<string, LanguagePair>();
  for (const p of languagePairs(doc)) for (const r of pairRows(p)) for (const id of [r.km, r.en]) pairOf.set(id, p);
  const unused = unusedLanguageInputs(doc);
  const shown = layers.filter(({ s }) => !unused.has(s.id));

  const row = ({ s, port }: { s: InputSource; port: number }) => {
    const isWired = wired.has(s.id);
    const isSelected = props.selected === s.id;
    const hiddenHere = !!overrides.get(s.id)?.hidden;
    const visible = s.visible && !hiddenHere;
    const pair = pairOf.get(s.id);
    return (
      <li
        key={s.id}
        className={layerRowClass({ selected: isSelected, hidden: !visible, unwired: !isWired, drop: dropAt === port })}
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
        <button type="button" className={layerNameClass(!visible, !isWired)} onClick={() => props.onSelect(s.id)}>
          <span>
            {s.label}
            {overrides.has(s.id) && (
              <span className={EDITED} title="Edited by hand on this Preview: it no longer follows the automatic layout. Reset it in the properties panel.">
                edited
              </span>
            )}
          </span>
          <span className="sc-muted">
            {KIND_LABEL[s.kind]} · {s.behavesLike}
            {isEmptyLayer(s) && ' · empty'}
            {!isWired && ' · not wired'}
            {outputId && !s.visible && ' · hidden everywhere'}
          </span>
        </button>
        {pair && (
          // The pair's language in use; switching swaps the picture only (V4). Every Preview draws the same language.
          <span className={LANG_SWITCH} role="group" aria-label={`${pair.label} language`}>
            {(['km', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                className={LANG}
                aria-pressed={pair.use === lang}
                disabled={readOnly || !!outputId}
                title={outputId ? 'Switch the language on Main Comps or the Headline node: every Preview uses it' : `Use ${lang === 'km' ? 'Khmer' : 'English'}`}
                onClick={() => run((d) => setLanguage(d, pair.id, lang, layoutDeps?.assets))}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </span>
        )}
        {!readOnly && outputId && (
          <span className={layerActionsClass(isSelected)}>
            <button
              type="button"
              aria-label={`${hiddenHere ? 'Show' : 'Hide'} layer ${s.label} on this Preview`}
              aria-pressed={hiddenHere}
              title={hiddenHere ? 'Show on this Preview' : 'Hide on this Preview'}
              disabled={!s.visible}
              onClick={() => run((d) => setOverrideHidden(d, outputId, s.id, !hiddenHere, author()))}
            >
              <Icon name={visible ? 'eye' : 'eye-off'} size={14} />
            </button>
          </span>
        )}
        {reorder && (
          <span className={layerActionsClass(isSelected)}>
            {!isWired && (
              <button type="button" aria-label={`Connect ${s.label} to main`} title="Connect to main" onClick={() => run((d) => connectSource(d, s.id, undefined, compositionId))}>
                <Icon name="plus" size={14} />
              </button>
            )}
            <LayerActions source={s} />
          </span>
        )}
      </li>
    );
  };

  return (
    <aside className={LAYERS} aria-label="Layers">
      <div className={LAYERS_TITLE}>
        Layers <span className="sc-muted">top = front</span>
      </div>
      <ol className={LAYERS_LIST}>{shown.map(row)}</ol>
    </aside>
  );
}

/** The KM / EN switch on a headline pair's row. */
const LANG_SWITCH = 'sc-layers__lang inline-flex flex-none gap-1 rounded-[5px] p-1 [background:var(--fig-hover)]';
const LANG =
  'cursor-pointer rounded-[4px] px-5 py-1 text-[10px] font-[700] [color:var(--fig-muted)] [background:none] [border:0] aria-pressed:[background:var(--fig-panel)] aria-pressed:[color:var(--fig-fg)] aria-pressed:[box-shadow:var(--shadow-1)] disabled:cursor-default';

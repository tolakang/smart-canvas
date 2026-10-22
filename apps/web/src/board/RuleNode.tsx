/**
 * D47: a Core Rule node (PDF page 3, "Core Rule": "Core Preset Guide", "Core Auto Layout Guide") for one master
 * preview. It shows how that master adapts to every output: its layer comp groups (D45), its preset guides —
 * square, vertical, horizontal (D42) — and the auto layout rule each layer follows (D38). Everything shown is
 * derived from the doc; only which master and where the node sits are stored.
 */
import { addGuides, deleteCoreRule, GUIDE_FAMILIES, GUIDE_LABEL, guideRows, LAYER_GROUP_LABEL, layerComp, layerRule, layerRuleText, masterOf, setCoreRuleComposition, wiredLayers } from '@smart-canvas/core';
import type { NodeProps } from '@xyflow/react';
import { useMemo } from 'react';
import { useBoard } from './context';
import type { RuleFlowNode } from './flow';
import { newId } from './ids';
import { Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

export function RuleNodeView({ data }: NodeProps<RuleFlowNode>) {
  const { rule } = data;
  const { doc, readOnly, run, openMainEditor } = useBoard();
  const masterId = masterOf(doc, rule.composition);
  const master = doc.compositions.find((c) => c.id === masterId);
  const masters = doc.compositions.filter((c) => !c.guide);
  const { groups, guides, rules } = useMemo(() => {
    const wired = new Set(wiredLayers(doc, masterId));
    const groups = layerComp(doc, masterId).map((g) => ({ ...g, layers: g.layers.filter((l) => wired.has(l.id)) }));
    const placements = master?.placements ?? {};
    const rules = groups.flatMap((g) => g.layers.filter((l) => l.visible).map((l) => ({ id: l.id, label: l.label, text: layerRuleText(layerRule(l, placements[l.id])) })));
    return { groups, guides: guideRows(doc, masterId), rules };
  }, [doc, masterId, master]);
  const missing = guides.filter((g) => !g.composition).map((g) => g.family);

  return (
    <div className="sc-node sc-node--rule" aria-label="Core rules">
      <div className="sc-node__head">
        <div className="sc-node__title">Core rules</div>
        {!readOnly && (
          <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label="Delete core rules" title="Delete this node (nothing else changes)" onClick={() => run((d) => deleteCoreRule(d, rule.id))}>
            <Icon name="trash" />
          </button>
        )}
      </div>
      <label className="sc-node__meta sc-rule__for">
        For{' '}
        <select className={NO_CANVAS} aria-label="Core rules for" value={masterId} disabled={readOnly || masters.length < 2} onChange={(e) => run((d) => setCoreRuleComposition(d, rule.id, e.target.value))}>
          {masters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <section className="sc-rule__section" aria-label="Layer comp">
        <h3 className="sc-rule__title">Layer comp · front to back</h3>
        <ol className="sc-rule__groups">
          {groups.map((g) => (
            <li key={g.group} data-group={g.group}>
              <span className="sc-rule__group">{LAYER_GROUP_LABEL[g.group]}</span>
              <span className="sc-muted">{g.layers.length ? g.layers.map((l) => l.label).join(', ') : '—'}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="sc-rule__section" aria-label="Core preset guide">
        <h3 className="sc-rule__title">Core preset guide</h3>
        <ul className="sc-rule__guides">
          {guides.map((g) => (
            <li key={g.family} data-family={g.family}>
              <span>{GUIDE_LABEL[g.family].replace(' guide', '')}</span>
              <span className="sc-muted">{g.composition ? `${g.outputs} ${g.outputs === 1 ? 'output' : 'outputs'}` : 'not added'}</span>
              {g.composition && (
                <button type="button" className={`sc-open-editor ${NO_CANVAS}`} aria-label={`${readOnly ? 'View' : 'Edit'} ${GUIDE_LABEL[g.family].toLowerCase()}`} onClick={() => g.composition && openMainEditor(g.composition.id)}>
                  {readOnly ? 'View' : 'Edit'}
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && missing.length > 0 && (
          <button type="button" className={`sc-btn ${NO_CANVAS}`} onClick={() => run((d) => addGuides(d, masterId, Object.fromEntries(missing.map((f) => [f, newId()]))))}>
            Add {GUIDE_FAMILIES.filter((f) => missing.includes(f)).map((f) => GUIDE_LABEL[f].toLowerCase()).join(' and ')}
          </button>
        )}
      </section>

      <section className="sc-rule__section" aria-label="Core auto layout guide">
        <h3 className="sc-rule__title">Core auto layout guide</h3>
        <ul className="sc-rule__layers">
          {rules.map((r) => (
            <li key={r.id} data-layer={r.id}>
              <span className="sc-rule__layer">{r.label}</span>
              <span className="sc-muted">{r.text}</span>
            </li>
          ))}
          {rules.length === 0 && <li className="sc-muted">No layers wired yet.</li>}
        </ul>
      </section>
    </div>
  );
}

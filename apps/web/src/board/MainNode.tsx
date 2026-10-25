/**
 * D49 (PDF page 3): the Layer Comp and the Core preset, side by side in one dashed group — the master.
 * - Layer Comp: the layer order as its four groups (logo, headline, elements, background), dragged into another
 *   order (D48); Square / Vertical / Horizontal open the editor of each of the master's layouts (D42).
 * - Core preset (V2, owner 2026-10-25: "change from Core Rule to Core preset … remove core auto layout guide"): which
 *   layout each Preview uses — sorted by shape on their own, dragged into another section by hand. The per-layer
 *   auto layout rules still drive every layout; they are just not shown.
 * Every asset node wires into the group's top; a wire dragged out of its bottom offers the Preset nodes.
 */
import {
  addGuides,
  compositionHealth,
  GUIDE_FAMILIES,
  guideRows,
  LAYER_GROUP_LABEL,
  layerComp,
  moveLayerGroup,
  setOutputLayout,
  wiredLayers,
  type GuideFamily,
  type LayerGroup,
} from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { useBoard } from './context';
import { LAYERS_HANDLE, OUTPUT_HANDLE, type MainFlowNode } from './flow';
import { HealthBadge } from './HealthBadge';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { NodeHead } from './NodeHead';

/** Controls that don't scroll: the wheel still zooms and pans the board over them. */
const NO_DRAG = 'nodrag nopan';
const GROUP_DRAG = 'application/x-sc-layer-group';
const OUTPUT_DRAG = 'application/x-sc-output-layout';
export const FAMILY_LABEL: Record<GuideFamily, string> = { square: 'Square', vertical: 'Vertical', horizontal: 'Horizontal' };

/** Opens one of the master's layout editors; a missing layout is added first (then opened). */
export function useOpenLayout(compositionId: string) {
  const { readOnly, run, openMainEditor, doc } = useBoard();
  return (family: GuideFamily) => {
    const have = guideRows(doc, compositionId).find((g) => g.family === family)?.composition;
    if (have) return openMainEditor(have.id);
    if (readOnly) return;
    const id = newId();
    const r = run((d) => addGuides(d, compositionId, { [family]: id }));
    if (r.ok) openMainEditor(id);
  };
}

export function MainNodeView({ data }: NodeProps<MainFlowNode>) {
  const { readOnly, run, doc, missingFonts } = useBoard();
  const { compositionId } = data;
  const health = useMemo(() => compositionHealth(doc, compositionId, missingFonts), [doc, compositionId, missingFonts]);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [overFamily, setOverFamily] = useState<GuideFamily | null>(null);
  const { groups, guides } = useMemo(() => {
    const wired = wiredLayers(doc, compositionId);
    const groups = layerComp(doc, compositionId).map((g) => ({ ...g, layers: g.layers.filter((l) => wired.has(l.id)) }));
    return { groups, guides: guideRows(doc, compositionId) };
  }, [doc, compositionId]);
  const layerCount = groups.reduce((n, g) => n + g.layers.length, 0);
  const previewCount = guides.reduce((n, g) => n + g.outputs.length, 0);

  const openLayout = useOpenLayout(compositionId);
  const dropGroup = (group: LayerGroup, to: number) => run((d) => ({ ok: true, doc: moveLayerGroup(d, group, to) }));

  return (
    <div className="sc-comp-group" aria-label="Layer comp and core preset">
      <Handle type="target" position={Position.Top} id={LAYERS_HANDLE} isConnectable={!readOnly} className="sc-handle--layer" title="Asset nodes wire in here" />
      <section className="sc-node sc-node--main" aria-label="Layer comp">
        <NodeHead icon="arrange" title="Layer Comp" sub={`${layerCount} ${layerCount === 1 ? 'layer' : 'layers'} · front to back`} extra={<HealthBadge health={health} />} />
        <div className="sc-comp__label">Layer order</div>
        <ol className={`sc-comp__groups ${NO_DRAG}`} aria-label="Layer order (front first)">
          {groups.map((g, i) => (
            <li
              key={g.group}
              data-group={g.group}
              className={`sc-comp__group${dropAt === i ? ' sc-comp__group--drop' : ''}`}
              draggable={!readOnly}
              onDragStart={(e) => e.dataTransfer.setData(GROUP_DRAG, g.group)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(GROUP_DRAG)) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDragLeave={() => setDropAt(null)}
              onDrop={(e) => {
                const group = e.dataTransfer.getData(GROUP_DRAG) as LayerGroup;
                setDropAt(null);
                if (!group) return;
                e.preventDefault();
                dropGroup(group, i);
              }}
            >
              {!readOnly && (
                <span className="sc-port__grip" aria-hidden="true">
                  <Icon name="grip" />
                </span>
              )}
              <span className="sc-comp__group-name">{LAYER_GROUP_LABEL[g.group]}</span>
              <span className="sc-muted sc-comp__count" title={g.layers.map((l) => l.label).join(', ')}>
                {g.layers.length}
              </span>
              {!readOnly && (
                <span className="sc-comp__moves">
                  <button type="button" className="sc-icon-btn" aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} up`} disabled={i === 0} onClick={() => dropGroup(g.group, i - 1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button type="button" className="sc-icon-btn" aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} down`} disabled={i === groups.length - 1} onClick={() => dropGroup(g.group, i + 1)}>
                    <Icon name="down" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="sc-comp__label">Layouts</div>
        <div className={`sc-comp__layouts ${NO_DRAG}`} role="group" aria-label="Layouts">
          {GUIDE_FAMILIES.map((f) => (
            <button key={f} type="button" className="sc-btn" onClick={() => openLayout(f)} aria-label={`${readOnly ? 'View' : 'Edit'} ${FAMILY_LABEL[f]} layout`}>
              {FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="sc-node sc-node--rule" aria-label="Core preset">
        <NodeHead icon="grid" title="Core preset" sub={`${previewCount} ${previewCount === 1 ? 'Preview' : 'Previews'} · sorted by shape`} />
        {/* D50: each Preview in its layout's section (closest shape, or as chosen); drag one into another section. */}
        <div className={`sc-rule__sections ${NO_DRAG}`} role="list" aria-label="Core preset">
          {guides.map((g) => (
            <section
              key={g.family}
              role="listitem"
              data-family={g.family}
              aria-label={`${FAMILY_LABEL[g.family]} layout`}
              className={`sc-rule__section-drop${overFamily === g.family ? ' sc-rule__section-drop--over' : ''}`}
              onDragOver={(e) => {
                if (readOnly || !e.dataTransfer.types.includes(OUTPUT_DRAG)) return;
                e.preventDefault();
                setOverFamily(g.family);
              }}
              onDragLeave={() => setOverFamily(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(OUTPUT_DRAG);
                setOverFamily(null);
                if (!id) return;
                e.preventDefault();
                run((d) => setOutputLayout(d, id, g.family, newId()));
              }}
            >
              <h4 className="sc-rule__section-title">
                {FAMILY_LABEL[g.family]}
                <span className="sc-rule__section-count">{g.outputs.length}</span>
              </h4>
              <ul className="sc-rule__chips">
                {g.outputs.map((o) => (
                  <li key={o.id} className={`sc-chip sc-rule__chip${o.chosen ? ' sc-rule__chip--chosen' : ''}`} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData(OUTPUT_DRAG, o.id)} data-output={o.id} title={o.chosen ? 'Chosen by hand' : 'Closest to its shape'}>
                    {o.label}
                    {o.chosen && !readOnly && (
                      <button type="button" className="sc-rule__chip-reset" aria-label={`${o.label}: back to the closest layout`} title="Back to the closest layout" onClick={() => run((d) => setOutputLayout(d, o.id, null, newId()))}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </li>
                ))}
                {g.outputs.length === 0 && <li className="sc-rule__empty">Drop a Preview here</li>}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <Handle type="source" position={Position.Bottom} id={OUTPUT_HANDLE} isConnectable={!readOnly} className="sc-handle--composition" title="Drag out to add a Preset node (FB, GDN, Website…)" />
    </div>
  );
}


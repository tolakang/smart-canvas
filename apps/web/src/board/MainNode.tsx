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
  presetFamilies,
  setOutputLayout,
  wiredLayers,
  type GuideFamily,
  type LayerGroup,
} from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { cardClass } from './card';
import { useBoard } from './context';
import { LAYERS_HANDLE, OUTPUT_HANDLE, type MainFlowNode } from './flow';
import { useHealth } from './HealthBadge';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { NodeHead } from './NodeHead';

/** Controls that don't scroll: the wheel still zooms and pans the board over them. */
const NO_DRAG = 'nodrag nopan';
const GROUP_DRAG = 'application/x-sc-layer-group';
const OUTPUT_DRAG = 'application/x-sc-output-layout';
export const FAMILY_LABEL: Record<GuideFamily, string> = { square: 'Square', vertical: 'Vertical', horizontal: 'Horizontal' };

/** Opens one of the master's layout editors; a missing layout is added first (then opened). */
/** The Layer Comp + Core preset group (D49, D50): one soft frame around both cards. */
const GROUP =
  "sc-comp-group relative flex items-start gap-20 rounded-[26px] px-22 pt-26 pb-22 [border:1px_solid_color-mix(in_srgb,var(--head-master)_22%,transparent)] [background:linear-gradient(180deg,color-mix(in_srgb,var(--head-master)_7%,transparent),color-mix(in_srgb,var(--head-preview)_5%,transparent))] [box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.4)]";
const LABEL = 'sc-comp__label mt-2 text-[11.5px] font-[650] tracking-[0.02em] text-muted';
/** A layer-order row: drag it, or use its ↑ ↓ buttons (shown on hover or focus; always on touch). */
const ROW =
  'group/row flex min-h-40 cursor-grab items-center gap-10 rounded-[12px] bg-surface-2 py-6 pr-8 pl-10 text-[13px] font-[550] [border:0] [transition:background_var(--t-fast),box-shadow_var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--surface-3)_80%,var(--surface-2))]';
const MOVE = 'size-26 rounded-[8px] text-[11px]';
/** How many layers a row holds, or Previews a section has. */
const COUNT = 'min-w-22 rounded-[99px] bg-surface px-7 py-1 text-center text-[11px] font-[650] text-muted';
/** A layout's section in the Core preset: drop a Preview chip here to choose it by hand. */
const SECTION = 'grid gap-8 rounded-[14px] border p-12 [transition:border-color_var(--t-fast),background_var(--t-fast)]';
const CHIP =
  'inline-flex max-w-full cursor-grab items-center gap-4 rounded-[99px] border bg-surface px-10 py-5 text-[12px] font-[550] [box-shadow:0_1px_1px_rgb(16_24_40/0.04)]';
/** UX B2: a size family to add, in the empty Export Group. */
const ADD_CHIP =
  'inline-flex h-30 cursor-pointer items-center gap-6 rounded-[99px] border border-line-strong bg-surface px-11 text-[12px] font-[600] text-fg hover:border-accent hover:text-accent';
/** UX B4: the chip's "Move to" menu and its items. */
const MOVE_MENU =
  'sc-rule__move absolute top-[calc(100%+4px)] left-0 z-20 grid min-w-140 gap-2 rounded-md border border-line bg-surface p-4 [box-shadow:var(--shadow-2)]';
const MOVE_ITEM = 'cursor-pointer rounded-sm bg-transparent px-8 py-6 text-left text-[12px] font-[550] text-fg [border:0] hover:bg-surface-2 focus-visible:bg-surface-2';
const CHIP_RESET =
  'sc-rule__chip-reset mr-[-4px] grid size-18 cursor-pointer place-items-center rounded-[50%] bg-transparent p-0 [color:inherit] [border:0] hover:bg-accent-soft';
const CHIP_MOVE = 'sc-rule__chip-move mr-[-4px] grid size-18 cursor-pointer place-items-center rounded-[50%] bg-transparent p-0 [color:inherit] [border:0] hover:bg-accent-soft';

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
  const { readOnly, run, doc, missingFonts, presets, addSizes } = useBoard();
  const { compositionId } = data;
  const health = useMemo(() => compositionHealth(doc, compositionId, missingFonts), [doc, compositionId, missingFonts]);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [overFamily, setOverFamily] = useState<GuideFamily | null>(null);
  // UX B4 (F9): the chip whose "Move to" menu is open — the drag's keyboard and tap alternative (WCAG 2.5.7).
  const [moving, setMoving] = useState<string | null>(null);
  const { groups, guides } = useMemo(() => {
    const wired = wiredLayers(doc, compositionId);
    const groups = layerComp(doc, compositionId).map((g) => ({ ...g, layers: g.layers.filter((l) => wired.has(l.id)) }));
    return { groups, guides: guideRows(doc, compositionId) };
  }, [doc, compositionId]);
  const layerCount = groups.reduce((n, g) => n + g.layers.length, 0);
  const previewCount = guides.reduce((n, g) => n + g.outputs.length, 0);

  const openLayout = useOpenLayout(compositionId);
  const dropGroup = (group: LayerGroup, to: number) => run((d) => ({ ok: true, doc: moveLayerGroup(d, group, to) }));

  const healthUi = useHealth(health);
  return (
    <div className={GROUP} aria-label="Main Comps and Export Group">
      <Handle type="target" position={Position.Top} id={LAYERS_HANDLE} isConnectable={!readOnly} className="sc-handle--layer" title="Asset nodes wire in here" />
      <section className={cardClass('main')} aria-label="Main Comps">
        <NodeHead icon="arrange" tone="[--head:var(--head-master)]" title="Main Comps" sub={`${layerCount} ${layerCount === 1 ? 'layer' : 'layers'} · front to back`} extra={healthUi.badge} />
        {healthUi.list}
        <div className={LABEL}>Layer order</div>
        <ol className={`sc-comp__groups m-0 grid list-none gap-6 p-0 ${NO_DRAG}`} aria-label="Layer order (front first)">
          {groups.map((g, i) => (
            <li
              key={g.group}
              data-group={g.group}
              className={`sc-comp__group ${ROW}${dropAt === i ? ' sc-comp__group--drop [box-shadow:inset_0_0_0_2px_var(--accent)]' : ''}`}
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
              <span className="sc-comp__group-name flex-1">{LAYER_GROUP_LABEL[g.group]}</span>
              <span className={`sc-muted sc-comp__count ${COUNT}`} title={g.layers.map((l) => l.label).join(', ')}>
                {g.layers.length}
              </span>
              {!readOnly && (
                <span className="sc-comp__moves hidden gap-2 group-focus-within/row:inline-flex group-hover/row:inline-flex pointer-coarse:inline-flex">
                  <button type="button" className={`sc-icon-btn ${MOVE}`} aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} up`} disabled={i === 0} onClick={() => dropGroup(g.group, i - 1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button type="button" className={`sc-icon-btn ${MOVE}`} aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} down`} disabled={i === groups.length - 1} onClick={() => dropGroup(g.group, i + 1)}>
                    <Icon name="down" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className={LABEL}>Layouts</div>
        <div className={`sc-comp__layouts grid grid-cols-[repeat(3,1fr)] gap-8 ${NO_DRAG}`} role="group" aria-label="Layouts">
          {GUIDE_FAMILIES.map((f) => (
            <button key={f} type="button" className="sc-btn h-36 justify-center rounded-[11px] font-[600]" onClick={() => openLayout(f)} aria-label={`${readOnly ? 'View' : 'Edit'} ${FAMILY_LABEL[f]} layout`}>
              {FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
      </section>

      <section className={cardClass('rule')} aria-label="Export Group">
        <NodeHead icon="grid" tone="[--head:var(--head-rule)]" title="Export Group" sub={previewCount ? `${previewCount} ${previewCount === 1 ? 'Preview' : 'Previews'} · sorted by shape` : 'No sizes yet'} />
        {previewCount === 0 ? (
          // UX B2 (F3): no Previews yet — the size families as one-tap chips, not three empty drop sections.
          <div className={`sc-rule__empty-state grid gap-8 ${NO_DRAG}`}>
            <p className="m-0 text-[12.5px] text-muted">{readOnly ? 'No sizes yet.' : 'Pick the sizes to make. Each one becomes a Preview.'}</p>
            {!readOnly && (
              <ul className="sc-rule__families m-0 flex list-none flex-wrap gap-6 p-0" aria-label="Add sizes">
                {presetFamilies(presets).map((f) => (
                  <li key={f.label}>
                    <button type="button" className={ADD_CHIP} onClick={() => addSizes(f.label)} aria-label={`Add ${f.label} sizes (${f.presets.length})`}>
                      {f.label} <span className="text-muted font-[500]">{f.presets.length}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className={`${ADD_CHIP} border-dashed text-accent`} onClick={() => addSizes(null)}>
                    <Icon name="plus" size={12} /> Custom size…
                  </button>
                </li>
              </ul>
            )}
          </div>
        ) : (
        /* D50: each Preview in its layout's section (closest shape, or as chosen); drag one into another section. */
        <div className={`sc-rule__sections grid gap-10 ${NO_DRAG}`} role="list" aria-label="Export Group">
          {guides.map((g) => (
            <section
              key={g.family}
              role="listitem"
              data-family={g.family}
              aria-label={`${FAMILY_LABEL[g.family]} layout`}
              className={`sc-rule__section-drop ${SECTION} ${overFamily === g.family ? 'sc-rule__section-drop--over border-accent bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]' : 'border-transparent bg-surface-2'}`}
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
              <h4 className="sc-rule__section-title m-0 flex items-center justify-between text-[12.5px] font-[650] text-fg">
                {FAMILY_LABEL[g.family]}
                <span className={`sc-rule__section-count ${COUNT}`}>{g.outputs.length}</span>
              </h4>
              <ul className="sc-rule__chips m-0 flex list-none flex-wrap gap-6 p-0 text-[11px]">
                {g.outputs.map((o) => (
                  <li key={o.id} className={`sc-chip sc-rule__chip ${CHIP} ${o.chosen ? 'sc-rule__chip--chosen border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] text-accent [outline:1px_solid_var(--accent)]' : 'border-[color-mix(in_srgb,var(--line)_90%,transparent)]'}`} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData(OUTPUT_DRAG, o.id)} data-output={o.id} title={o.chosen ? 'Chosen by hand' : 'Closest to its shape'}>
                    {o.label}
                    {!readOnly && (
                      <span className="relative inline-flex">
                        <button
                          type="button"
                          className={CHIP_MOVE}
                          aria-label={`Move ${o.label} to another layout`}
                          aria-haspopup="menu"
                          aria-expanded={moving === o.id}
                          title="Move to another layout"
                          onClick={() => setMoving((m) => (m === o.id ? null : o.id))}
                          onKeyDown={(e) => e.key === 'Escape' && setMoving(null)}
                        >
                          <Icon name="more" size={12} />
                        </button>
                        {moving === o.id && (
                          <span role="menu" aria-label={`Move ${o.label} to`} className={MOVE_MENU} onKeyDown={(e) => e.key === 'Escape' && setMoving(null)}>
                            {GUIDE_FAMILIES.filter((f) => f !== g.family).map((f) => (
                              <button
                                key={f}
                                type="button"
                                role="menuitem"
                                className={MOVE_ITEM}
                                onClick={() => {
                                  setMoving(null);
                                  run((d) => setOutputLayout(d, o.id, f, newId()));
                                }}
                              >
                                Move to {FAMILY_LABEL[f]}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                    {o.chosen && !readOnly && (
                      <button type="button" className={CHIP_RESET} aria-label={`${o.label}: back to the closest layout`} title="Back to the closest layout" onClick={() => run((d) => setOutputLayout(d, o.id, null, newId()))}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </li>
                ))}
                {g.outputs.length === 0 && <li className="sc-rule__empty text-[12px] text-muted">Drop a Preview here</li>}
              </ul>
            </section>
          ))}
        </div>
        )}
      </section>
      <Handle type="source" position={Position.Bottom} id={OUTPUT_HANDLE} isConnectable={!readOnly} className="sc-handle--composition" title="Drag out to add a Preset node (FB, GDN, Website…)" />
    </div>
  );
}


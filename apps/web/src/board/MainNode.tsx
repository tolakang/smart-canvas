/**
 * D49 (PDF page 3): Main Comps, the master, in one soft group frame (UX C3: the Export Group card beside it is gone).
 * - The layer order as its four groups (logo, headline, elements, background), dragged into another order (D48);
 *   Square / Vertical / Horizontal open the editor of each of the master's layouts (D42).
 * - UX B2 / C3: with no sizes yet, the size families as one-tap chips ("Add sizes"). Which layout a size uses is
 *   chosen on its row in the Preset node (D50 as amended by D72).
 * Every asset node wires into the group's top; a wire dragged out of its bottom offers the Preset nodes.
 */
import {
  addGuides,
  compositionHealth,
  layerSources,
  masterScene,
  guideRows,
  LAYER_GROUP_LABEL,
  layerComp,
  moveLayerGroup,
  presetFamilies,
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
import { NO_DRAG } from './pinch';
import { iconBtn } from '../ui/button';
import { GRIP } from '../ui/controls';
import { MUTED_TEXT } from '../ui/tw';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';

/** Controls that don't scroll: the wheel still zooms and pans the board over them. */
const GROUP_DRAG = 'application/x-sc-layer-group';
export const FAMILY_LABEL: Record<GuideFamily, string> = { square: 'Square', vertical: 'Vertical', horizontal: 'Horizontal' };

/** Opens one of the master's layout editors; a missing layout is added first (then opened). */
/** The Main Comps group (D49): one soft frame around the master's card, carrying its wires. */
const GROUP =
  "sc-comp-group relative flex items-start gap-20 rounded-[26px] px-22 pt-26 pb-22 [border:1px_solid_color-mix(in_srgb,var(--head-master)_22%,transparent)] [background:linear-gradient(180deg,color-mix(in_srgb,var(--head-master)_7%,transparent),color-mix(in_srgb,var(--head-preview)_5%,transparent))] [box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.4)]";
const LABEL = 'sc-comp__label mt-2 text-[11.5px] font-[650] tracking-[0.02em] text-muted';
/** A layer-order row: drag it, or use its ↑ ↓ buttons (shown on hover or focus; always on touch). */
const ROW =
  'group/row flex min-h-40 cursor-grab items-center gap-10 rounded-[12px] bg-surface-2 py-6 pr-8 pl-10 text-[13px] font-[550] [border:0] [transition:background_var(--t-fast),box-shadow_var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--surface-3)_80%,var(--surface-2))]';
const MOVE = `${iconBtn({ size: 'size-26', round: 'rounded-[8px]' })} text-[11px]`;
/** How many layers a row holds. */
const COUNT = 'min-w-22 rounded-[99px] bg-surface px-7 py-1 text-center text-[11px] font-[650] text-muted';
/** UX B2 / C3: a size family to add, while Main Comps has no sizes. */
const ADD_CHIP =
  'inline-flex h-30 cursor-pointer items-center gap-6 rounded-[99px] border border-line-strong bg-surface px-11 text-[12px] font-[600] text-fg hover:border-accent hover:text-accent';

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

/** Owner, 2026-11-03 (D81): a layout as a small live picture in its own shape, its name and the sizes that follow it. */
const THUMB_BOX = { w: 92, h: 64 };
/** D85: Edit all, beside the Layouts label. */
const EDIT_ALL =
  'inline-flex h-26 cursor-pointer items-center gap-5 rounded-[8px] bg-[color-mix(in_srgb,var(--head-master)_12%,var(--surface))] px-9 text-[12px] font-[650] text-[color-mix(in_srgb,var(--head-master)_65%,var(--fg))] [border:0] [transition:background_var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--head-master)_22%,var(--surface))] pointer-coarse:h-36 pointer-coarse:px-12';
const LAYOUT =
  'sc-comp__layout group/lay grid cursor-pointer justify-items-center gap-4 rounded-[12px] border border-line bg-surface px-6 pt-8 pb-6 text-center [transition:border-color_var(--t-fast),box-shadow_var(--t-fast)] hover:border-accent focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1';

/**
 * The master's three layouts as pictures: each made layout as it is, one not made yet as opening it would make it
 * from Square (D81). Shared by the card and the layout editor's strip (D85).
 */
export function useLayoutPictures(compositionId: string) {
  const { doc } = useBoard();
  return useMemo(() => {
    const seeded = addGuides(doc, compositionId, { vertical: '__thumb-vertical', horizontal: '__thumb-horizontal', square: '__thumb-square' });
    const seedDoc = seeded.ok ? seeded.doc : doc;
    return guideRows(doc, compositionId).map((row) => {
      const shown = row.composition ?? guideRows(seedDoc, compositionId).find((g) => g.family === row.family)?.composition;
      return { ...row, isMaster: row.composition?.id === compositionId, scene: shown ? masterScene(row.composition ? doc : seedDoc, shown.id) : null };
    });
  }, [doc, compositionId]);
}

function LayoutThumbs(props: { compositionId: string; onOpen: (f: GuideFamily) => void }) {
  const { doc, readOnly, teamId, layoutDeps } = useBoard();
  const layers = useMemo(() => layerSources(doc), [doc]);
  const pictures = useLayoutPictures(props.compositionId);
  return (
    <div className={`sc-comp__layouts grid grid-cols-[repeat(3,minmax(0,1fr))] items-end gap-8 ${NO_DRAG}`} role="group" aria-label="Layouts">
      {pictures.map(({ family, composition, outputs, isMaster, scene }) => {
        const n = outputs.length;
        return (
          <button
            key={family}
            type="button"
            className={`${LAYOUT}${n === 0 && !isMaster ? ' sc-comp__layout--unused [&_.sc-comp__layout-pic]:opacity-60' : ''}`}
            onClick={() => props.onOpen(family)}
            aria-label={`${readOnly ? 'View' : 'Edit'} ${FAMILY_LABEL[family]} layout`}
            title={composition ? `${FAMILY_LABEL[family]} layout — ${n} ${n === 1 ? 'size follows' : 'sizes follow'} it` : `${FAMILY_LABEL[family]} layout — not made yet; ${readOnly ? '' : 'click to make it from Square'}`}
          >
            <span className="sc-comp__layout-pic grid h-64 place-items-end" aria-hidden="true">
              {scene && (
                <span className={composition ? '' : 'rounded-[3px] [outline:1.5px_dashed_var(--line-strong)] outline-offset-2'}>
                  <RenderThumbnail scene={scene} sources={layers} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={THUMB_BOX.w} maxHeight={THUMB_BOX.h} />
                </span>
              )}
            </span>
            <span className="text-[12.5px] leading-[1.2] font-[650]">{FAMILY_LABEL[family]}</span>
            <span className="text-[11px] leading-[1.2] text-muted">{isMaster ? 'master · ' : ''}{n} {n === 1 ? 'size' : 'sizes'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MainNodeView({ data }: NodeProps<MainFlowNode>) {
  const { readOnly, run, doc, missingFonts, presets, addSizes } = useBoard();
  const { compositionId } = data;
  const health = useMemo(() => compositionHealth(doc, compositionId, missingFonts), [doc, compositionId, missingFonts]);
  const [dropAt, setDropAt] = useState<number | null>(null);
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
    <div className={GROUP} aria-label="Main Comps group">
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
                <span className={GRIP} aria-hidden="true">
                  <Icon name="grip" />
                </span>
              )}
              <span className="sc-comp__group-name flex-1">{LAYER_GROUP_LABEL[g.group]}</span>
              <span className={`${MUTED_TEXT} sc-comp__count ${COUNT}`} title={g.layers.map((l) => l.label).join(', ')}>
                {g.layers.length}
              </span>
              {!readOnly && (
                <span className="sc-comp__moves hidden gap-2 group-focus-within/row:inline-flex group-hover/row:inline-flex pointer-coarse:inline-flex">
                  <button type="button" className={MOVE} aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} up`} disabled={i === 0} onClick={() => dropGroup(g.group, i - 1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button type="button" className={MOVE} aria-label={`Move ${LAYER_GROUP_LABEL[g.group]} down`} disabled={i === groups.length - 1} onClick={() => dropGroup(g.group, i + 1)}>
                    <Icon name="down" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-8">
          <div className={LABEL}>Layouts</div>
          {/* D85: the three layouts in one editor, each a click away in its strip (each picture still opens its own). */}
          <button
            type="button"
            className={`${EDIT_ALL} sc-comp__edit-all ${NO_DRAG}`}
            onClick={() => openLayout('square')}
            aria-label={`${readOnly ? 'View' : 'Edit'} all layouts`}
            title="Open the layouts in one editor and switch between them"
          >
            <Icon name="pencil" size={12} />
            {readOnly ? 'View all' : 'Edit all'}
          </button>
        </div>
        <LayoutThumbs compositionId={compositionId} onOpen={openLayout} />
        {previewCount === 0 && (
          // UX B2 (F3), C3: no sizes yet — the size families as one-tap chips.
          <div className={`sc-comp__add-sizes grid gap-8 ${NO_DRAG}`}>
            <div className={LABEL}>Sizes</div>
            <p className="m-0 text-[12.5px] text-muted">{readOnly ? 'No sizes yet.' : 'Pick the sizes to make. Each one becomes a Preview.'}</p>
            {!readOnly && (
              <ul className="m-0 flex list-none flex-wrap gap-6 p-0" aria-label="Add sizes">
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
        )}
      </section>

      <Handle type="source" position={Position.Bottom} id={OUTPUT_HANDLE} isConnectable={!readOnly} className="sc-handle--composition" title="Drag out to add a Preset node (FB, GDN, Website…)" />
    </div>
  );
}


/**
 * Output node (T4.7): name, size, layout health and a live thumbnail computed by the layout engine and drawn
 * by the same OutputRenderer as export. Its settings (preset, size, scale / DPI, bleed, disconnect) are in the
 * inspector (T13.2, OutputSettings.tsx).
 */
import {
  canvasMetrics,
  guideFor,
  outputComposition,
  computeLayout,
  outputHealth,
  convertSize,
  layerSources,
  outputDefaults,
  outputScene,
  resetOutputOverrides,
  type OutputNode,
  type OutputSettings,
  type SizePreset,
  type Unit,
} from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useDeferredValue, useMemo } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import type { OutputFlowNode } from './flow';
import { HealthBadge } from './HealthBadge';
import { Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { approvalOf, threadsOf } from './review';

const NO_CANVAS = 'nodrag nopan nowheel';

/** A Preview card (V2): wider and roomier than the base card; dashed, with a grey head, while disconnected (frozen). */
const CARD = 'w-280 gap-14 rounded-[20px] p-16';
/** The approval pill (also in the Review panel). */
export const APPROVAL_PILL = 'inline-flex h-20 items-center rounded-[10px] px-6 py-0 text-[11px] font-[600] whitespace-nowrap';
const FROZEN = 'border-line-strong [border-style:dashed] before:bg-line-strong [.selected_&]:border-accent'; // selected: React Flow's accent still wins
/** Its approval (D63): approved as it looks now, or changed since. */
export const APPROVAL: Record<'approved' | 'changed' | 'none', string> = {
  approved: 'bg-ok-soft text-ok',
  changed: 'bg-warn-soft text-warn',
  none: 'bg-surface-2 text-muted',
};
/** The quiet line under the picture: its layout as a pill (bleed as text). */
const META = 'flex flex-wrap gap-6 [&>span]:rounded-[99px] [&>span]:bg-surface-2 [&>span]:px-8 [&>span]:py-2 [&>span]:text-[11.5px] [&>span]:font-[600] [&>span]:text-muted';
/** The picture, large on a soft checkerboard. */
const THUMB =
  'sc-main-thumb grid min-h-120 max-w-full place-items-center overflow-hidden rounded-[14px] p-10 [border:0] [background:repeating-conic-gradient(color-mix(in_srgb,var(--checker-a)_70%,transparent)_0_25%,transparent_0_50%)_0_0/14px_14px,var(--surface-2)]';
const EXPORT =
  'inline-flex h-38 w-full cursor-pointer items-center justify-center gap-8 [justify-self:center] rounded-[12px] bg-[color-mix(in_srgb,var(--head-preview)_14%,var(--surface))] px-16 py-0 text-[13px] font-[650] text-[color-mix(in_srgb,var(--head-preview)_70%,var(--fg))] [border:0] hover:bg-[color-mix(in_srgb,var(--head-preview)_24%,var(--surface))]';

export function presetSettings(p: SizePreset): OutputSettings {
  return {
    presetId: p.id,
    size: { ...p.size },
    ...(p.size.unit === 'mm' ? { dpi: p.dpi ?? outputDefaults('mm').dpi, bleedMm: p.bleedMm ?? 0 } : { bleedMm: p.bleedMm ?? 0 }),
  };
}

/** The name an output gets from its size when none is typed ("1200×630 px"). */
export const sizeLabel = (s: { width: number; height: number; unit: Unit }) => `${s.width}×${s.height} ${s.unit}`;
/** A Preview's name without the size its label may end with ("GDN 1200×200" → "GDN"). */
export const nameWithoutSize = (label: string) => label.replace(/\s*\d+\s*[×x]\s*\d+(\s*(px|mm))?$/, '').trim();

/**
 * T10.2: an output still named after its size or preset follows size / preset changes (a "1080×1350 px"
 * node showing 1200×630 was misleading); a name typed by hand stays.
 */
export function withAutoLabel(o: OutputNode, presets: readonly SizePreset[], patch: OutputSettings): OutputSettings {
  const auto = o.label === sizeLabel(o.size) || presets.some((p) => p.name === o.label);
  if (!auto || patch.label !== undefined) return patch;
  const preset = patch.presetId ? presets.find((p) => p.id === patch.presetId) : undefined;
  const size = patch.size ?? o.size;
  return { ...patch, label: preset ? preset.name : sizeLabel(size) };
}

/** The settings a px/mm toggle writes: same physical size, and print defaults the first time mm is chosen. */
export function unitSettings(o: OutputNode, unit: Unit): OutputSettings {
  if (o.size.unit === unit) return {};
  return { size: convertSize(o.size, unit), ...(unit === 'mm' && o.dpi === undefined ? { dpi: outputDefaults('mm').dpi } : {}) };
}

export function OutputNodeView({ data }: NodeProps<OutputFlowNode>) {
  const { output, connected } = data;
  const { doc, readOnly, run, teamId, layoutDeps, missingFonts, openOutputEditor, exportOutputs, review, approvals } = useBoard();
  const openThreads = threadsOf(review, output.id).length;
  const approval = approvalOf(approvals, output.id);
  // T7.4: thumbnails lag behind edits (deferred) so typing and dragging stay responsive with 10 outputs.
  const shownDoc = useDeferredValue(doc);
  // The node can outlive its output by a render (React Flow syncs nodes after the doc changes).
  const { scene, health } = useMemo(() => {
    const current = shownDoc.outputs.find((o) => o.id === output.id);
    if (!layoutDeps || !current) return { scene: null, health: null };
    const layout = computeLayout(shownDoc, output.id, layoutDeps);
    return { scene: outputScene(layout, current), health: outputHealth(shownDoc, output.id, layout, missingFonts) };
  }, [shownDoc, output.id, layoutDeps, missingFonts]);
  const shownLayers = useMemo(() => layerSources(shownDoc), [shownDoc]);
  const bleed = output.bleedMm ?? 0;
  // D42: the guide this output's layout comes from (none shown when it is the master itself).
  const guide = useMemo(() => {
    const comp = outputComposition(shownDoc, output.id);
    const g = comp && connected ? guideFor(shownDoc, comp, canvasMetrics(output).trim, output.layout) : undefined;
    return g?.guide ? g.label : null;
  }, [shownDoc, output, connected]);

  return (
    // D49 (page 3): a Preview — one size of a Preset node, its live layout, Edit (its own overrides) and Export.
    <div className={`sc-node sc-node--output${connected ? '' : ' sc-node--frozen'} ${CARD} ${connected ? 'before:bg-type-output' : FROZEN}`} aria-label={`Preview ${output.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly && !connected} className="sc-handle--composition" title="From its Preset node row" />
      {/* V2 (owner: "Header text of each panel should drop by line"): its name, then "Preview · W × H" under it. */}
      <NodeHead
        icon="preview"
        tone={connected ? '[--head:var(--head-preview)]' : '[--head:var(--head-frozen)]'}
        title={nameWithoutSize(output.label) || output.label}
        sub={
          <span className="sc-preview__size min-w-0 flex-1 overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-muted [font-variant-numeric:tabular-nums]" title={output.label}>
            {output.size.width} × {output.size.height} {output.size.unit}
          </span>
        }
        extra={
          <>
            {health && <HealthBadge health={health} />}
            <button type="button" className={`sc-head__action ${NO_CANVAS}`} onClick={() => openOutputEditor(output.id)} aria-label={`${readOnly ? 'View' : 'Edit'} Preview ${output.label}`}>
              <Icon name={readOnly ? 'eye' : 'pencil'} size={13} />
              {readOnly ? 'View' : 'Edit'}
            </button>
          </>
        }
      />
      {(approval.state !== 'none' || openThreads > 0) && (
        // D63: the Preview's review — its approval and open comments.
        <div className="sc-preview__review flex flex-wrap items-center gap-6 px-12 pt-6 pb-0">
          {approval.state !== 'none' && (
            // D63: approved as it looks now, or changed since.
            <span
              className={`sc-preview__approval sc-preview__approval--${approval.state} ${APPROVAL_PILL} ${APPROVAL[approval.state]}`}
              title={approval.state === 'approved' ? `Approved by ${approval.approval?.approvedBy ?? 'someone'}` : 'Changed since it was approved'}
            >
              {approval.state === 'approved' ? '✓ Approved' : 'Changed since approved'}
            </span>
          )}
          {openThreads > 0 && (
            // D63: open comments; opens the editor on them.
            <button
              type="button"
              className={`sc-preview__comments inline-flex h-20 cursor-pointer items-center gap-3 rounded-[10px] bg-accent-soft px-6 py-0 text-[11px] font-[600] [line-height:inherit] text-accent [border:0] ${NO_CANVAS}`}
              onClick={() => openOutputEditor(output.id, { comments: true })}
              aria-label={`${openThreads} open ${openThreads === 1 ? 'comment' : 'comments'} on ${output.label}`}
              title="Open comments"
            >
              <Icon name="comment" size={12} />
              {openThreads}
            </button>
          )}
        </div>
      )}
      {(guide || bleed > 0) && (
        <div className={`sc-node__meta ${META}`}>
          {bleed > 0 && `bleed ${bleed} mm`}
          {guide && <span title="Its layout comes from this layout of the Layer Comp, the closest to its shape (D42)">{guide}</span>}
        </div>
      )}
      {output.overrides.length > 0 && (
        <div className="sc-node__overrides flex items-center justify-between gap-(--sp-2)">
          <span className="sc-chip" title="Layers changed by hand on this Preview" aria-label={`${output.overrides.length} overridden layers`}>
            {output.overrides.length} edited by hand
          </span>
          {!readOnly && (
            <button
              type="button"
              className={`sc-btn sc-btn--ghost ${NO_CANVAS}`}
              onClick={() => window.confirm(`Reset all overridden layers of “${output.label}” to auto?`) && run((d) => resetOutputOverrides(d, output.id))}
            >
              Reset output
            </button>
          )}
        </div>
      )}
      {!connected && <div className={`sc-node__meta sc-output__frozen ${META} text-warn`}>Disconnected — layout frozen</div>}
      <div className={THUMB} aria-label={`${output.label} preview`}>
        {scene ? (
          <RenderThumbnail scene={scene} sources={shownLayers} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={236} maxHeight={180} />
        ) : (
          <span className="sc-muted">Loading fonts…</span>
        )}
      </div>
      <button type="button" className={`sc-preview__export ${EXPORT} ${NO_CANVAS}`} onClick={() => exportOutputs([output.id])} aria-label={`Export Preview ${output.label}`}>
        <Icon name="export" size={14} />
        Export
      </button>
    </div>
  );
}

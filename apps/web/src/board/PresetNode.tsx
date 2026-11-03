/**
 * D46: a Preset node (PDF page 3, "GDN Preset Node") — a list of media sizes fed by one wire from a master
 * preview. Each row is an output wired out to its own Preview node (Edit / Export there); cutting a row's wire
 * disconnects that size (its layout freezes). Rows are dragged into another order, added from the team's presets
 * or as a custom W × H, or removed. N5: "Save as team preset" saves the node's sizes as a team preset family, so
 * it is offered as a Preset node from then on. UX C3 (D72): each row also says which of Main Comps' layouts its
 * Preview uses — the one closest to its shape, or another picked there (S · V · H).
 */
import { addSizeToSet, canvasMetrics, setAllPreviewsHidden, deleteOutput, deletePresetSet, familyOfShape, GUIDE_FAMILIES, moveSetRow, renameSet, setFamily, setOutputLayout, setPreviewHidden, type GuideFamily, type OutputNode, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { cardClass, HEAD_ACTION } from './card';
import { useBoard } from './context';
import { setRowHandle, type SetFlowNode } from './flow';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { FAMILY_LABEL } from './MainNode';
import { presetSettings, rowName } from './OutputNode';
import { NO_CANVAS, TOUCH_NO_PAN } from './pinch';
import { useSaveAsFamily } from './preset-save';
import { btn, iconBtn } from '../ui/button';
import { MUTED_TEXT } from '../ui/tw';


/**
 * A size row (D46): the size first, its name, then the eye and the trash, shown on hover or keyboard focus (always
 * on touch, and the eye while it hides a Preview). The size drags it (owner, 2026-11-03: no grip dots); its handle
 * starts a wire. Its buttons are 32 px (owner: "the buttons are too small").
 */
const ROW =
  'group/row relative flex min-h-48 items-center gap-8 py-6 pr-16 pl-16 text-[12px] [border-top:1px_solid_color-mix(in_srgb,var(--line)_70%,transparent)] [background:none] [transition:background_var(--t-fast)] hover:bg-surface-2';
const ROW_ACTION =
  'opacity-0 [transition:opacity_var(--t-fast)] group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100';

const ROW_DRAG = 'application/x-sc-preset-row';
const ROW_BUTTON = 'size-32';

/** UX C3: a row's layout choice — three small buttons; the one in use raised, in the accent when picked by hand. */
const SEG = 'sc-preset__layout inline-flex flex-none gap-2 rounded-[9px] bg-surface-2 p-2';
const SEG_BUTTON =
  'h-28 min-w-28 cursor-pointer rounded-[7px] px-6 text-[12px] font-[700] text-muted [background:none] [border:0] hover:text-fg disabled:cursor-default aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:[box-shadow:var(--shadow-1)] data-[chosen]:aria-pressed:text-accent pointer-coarse:h-36 pointer-coarse:min-w-36';
const SHORT: Record<GuideFamily, string> = { square: 'S', vertical: 'V', horizontal: 'H' };

/** The layout an output takes by its shape alone (D50). */
export const closestLayout = (o: OutputNode): GuideFamily => {
  const { trim } = canvasMetrics(o);
  return familyOfShape({ width: trim.w, height: trim.h });
};
/** The "Add a size" choice that opens the custom W × H fields. */
const CUSTOM = '__custom';

export function PresetNodeView({ id, data }: NodeProps<SetFlowNode>) {
  const { set, rows } = data;
  const { doc, readOnly, run, presets, exportOutputs, collapsed, openEditAll } = useBoard();
  const folded = collapsed.has(id);
  const updateInternals = useUpdateNodeInternals();
  const rowKey = rows.map((r) => r.output.id).join(',');
  useEffect(() => updateInternals(id), [id, rowKey, updateInternals]);
  const used = new Set(rows.map((r) => r.output.presetId));
  const hidden = new Set(set.hidden ?? []);
  /** Owner, 2026-11-03: every size's Preview hidden (the header row's eye shows them all again). */
  const allHidden = rows.length > 0 && rows.every((r) => hidden.has(r.output.id));
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [custom, setCustom] = useState<{ w: string; h: string } | null>(null);
  const addCustom = () => {
    const w = Math.round(Number(custom?.w));
    const h = Math.round(Number(custom?.h));
    setCustom(null);
    if (!(w > 0 && h > 0 && w <= 20000 && h <= 20000)) return;
    run((d) => addSizeToSet(d, set.id, { id: newId(), label: `${set.label} ${w}×${h}`, size: { width: w, height: h, unit: 'px' } }));
  };
  const addable = presets.filter((p) => !used.has(p.id));
  /**
   * Q2: the team family this node's sizes came from. Renamed since (in the Size presets dialog): offer its new name;
   * grown since: offer the sizes it gained. Each is one undo step.
   */
  const family = setFamily(doc, set.id, presets);
  const addMissing = () =>
    run((d) =>
      (family?.missing ?? []).reduce<SourceResult>((r, p) => (r.ok ? addSizeToSet(r.doc, set.id, { id: newId(), label: p.name, ...presetSettings(p), size: { ...p.size } }) : r), { ok: true, doc: d as ProjectDoc }),
    );

  const saving = useSaveAsFamily(set, rows.map((r) => r.output));

  return (
    <div className={cardClass('preset')} aria-label={`Preset ${set.label}`}>
      <Handle type="target" position={Position.Top} isConnectable={!readOnly} className="sc-handle--composition" title="From the Main Comps group: feeds every size" />
      <NodeHead
        icon="grid"
        tone="[--head:var(--head-preset)]"
        title={set.label}
        sub={`${rows.length} ${rows.length === 1 ? 'size' : 'sizes'}`}
        onRename={readOnly ? undefined : (name) => run((d) => renameSet(d, set.id, name))}
        renameValue={set.label}
        renameLabel="Preset name"
        menuLabel={`${set.label} actions`}
        menu={
          readOnly
            ? []
            : [
                ...(rows.length > 0 ? [{ label: 'Edit all sizes', icon: 'pencil' as const, onSelect: () => openEditAll(set.id) }] : []),
                ...(rows.length > 0 ? [{ label: allHidden ? 'Show all Previews' : 'Hide all Previews', icon: allHidden ? ('eye' as const) : ('eye-off' as const), onSelect: () => run((d) => setAllPreviewsHidden(d, set.id, !allHidden)) }] : []),
                // UX B6 (F20): saving the sizes is an occasional job; it lives in ⋯, not as a third button on the card.
                ...(rows.length > 0 ? [{ label: 'Save as team preset', icon: 'library' as const, onSelect: () => void saving.save() }] : []),
                { label: `Delete preset ${set.label}`, icon: 'trash', danger: true, separated: rows.length > 0, onSelect: () => window.confirm(`Delete “${set.label}” and its ${rows.length} sizes?`) && run((d) => deletePresetSet(d, set.id)) },
              ]
        }
        extra={
          rows.length > 0 && (
            <>
              {/* D83: every size of the node in one editor, each a click away (each Preview's own Edit stays). */}
              <button type="button" className={`${HEAD_ACTION} sc-preset__edit-all ${NO_CANVAS}`} onClick={() => openEditAll(set.id)} aria-label={`${readOnly ? 'View' : 'Edit'} all ${set.label} sizes`} title="Open every size of this node in one editor">
                <Icon name="pencil" size={14} />
                {readOnly ? 'View all' : 'Edit all'}
              </button>
              <button type="button" className={`${HEAD_ACTION} ${NO_CANVAS}`} onClick={() => exportOutputs(rows.map((r) => r.output.id), set.id)} aria-label={`Export all ${set.label} sizes`} title="Export every size as one ZIP">
                <Icon name="export" size={14} />
                Export
              </button>
            </>
          )
        }
      />
      {!readOnly && family && (family.label !== set.label || family.missing.length > 0) && (
        <div className={`sc-preset__family flex flex-wrap gap-4 px-(--sp-2) pt-0 pb-(--sp-1) [&_.sc-btn]:text-sm ${NO_CANVAS}`} role="group" aria-label={`Team family ${family.label}`}>
          {family.label !== set.label && (
            <button type="button" className={btn('ghost', 'node')} onClick={() => run((d) => renameSet(d, set.id, family.label))} title="The team family these sizes came from has this name now">
              Rename to “{family.label}”
            </button>
          )}
          {family.missing.length > 0 && (
            <button type="button" className={btn('ghost', 'node')} onClick={addMissing} title={family.missing.map((p) => p.name).join(', ')}>
              Add {family.missing.length} new {family.missing.length === 1 ? 'size' : 'sizes'}
            </button>
          )}
        </div>
      )}
      {folded && (
        // Collapsed: every size's handle at the header's right edge, so its wire to its Preview stays on.
        <div className="sc-node__keep pointer-events-none absolute top-32 right-0 h-0 w-0" aria-hidden="true">
          {rows.map(({ output, connected }) => (
            <Handle key={output.id} type="source" position={Position.Right} id={setRowHandle(output.id)} isConnectable={!readOnly && !connected} className="sc-handle--composition pointer-events-auto" />
          ))}
        </div>
      )}
      {rows.length > 0 && (
        // Owner, 2026-11-03: hide or show every size's Preview at once — the eye heading the rows' own eyes.
        <div className={`sc-preset__head mx-[-16px] my-[-6px] flex min-h-36 items-center gap-8 pr-16 pl-16 text-[11.5px] font-[650] text-muted ${NO_CANVAS}`}>
          <span className="flex-1">Previews</span>
          <button
            type="button"
            className={`${iconBtn({ size: ROW_BUTTON, round: 'rounded-[8px]' })} sc-preset__eye-all aria-pressed:text-muted`}
            aria-label={`${allHidden ? 'Show' : 'Hide'} all ${set.label} Previews`}
            aria-pressed={allHidden}
            disabled={readOnly}
            title={allHidden ? 'Show every Preview on the board' : 'Hide every Preview from the board (they still export)'}
            onClick={() => run((d) => setAllPreviewsHidden(d, set.id, !allHidden))}
          >
            <Icon name={allHidden ? 'eye-off' : 'eye'} />
          </button>
          {/* Keeps the eye over the rows' eyes: the trash column's width. */}
          {!readOnly && <span className={`${iconBtn({ size: ROW_BUTTON })} invisible`} aria-hidden="true" />}
        </div>
      )}
      <ol className="sc-ports sc-preset__rows mx-[-16px] my-0 list-none p-0" aria-label={`${set.label} sizes`}>
        {rows.map(({ output, connected }, i) => (
          <li
            key={output.id}
            className={`sc-port${connected ? ' sc-port--wired' : ' sc-port--frozen text-muted'}${dropAt === i ? ' sc-port--drop [box-shadow:inset_0_2px_0_var(--accent)]' : ''} ${ROW}`}
            data-output={output.id}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(ROW_DRAG)) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(ROW_DRAG);
              setDropAt(null);
              if (!id) return;
              e.preventDefault();
              run((d) => moveSetRow(d, set.id, id, i));
            }}
          >
            {/* The size drags the row (the row's handle starts a wire). */}
            <span
              className={`sc-preset__size min-w-88 flex-none text-[13px] font-[600] [font-variant-numeric:tabular-nums] ${readOnly ? '' : `cursor-grab active:cursor-grabbing ${TOUCH_NO_PAN}`}`}
              draggable={!readOnly}
              onDragStart={(e) => e.dataTransfer.setData(ROW_DRAG, output.id)}
              title={readOnly ? undefined : 'Drag to re-order'}
            >
              {output.size.width} × {output.size.height}
            </span>
            <span className="sc-port__label min-w-0 flex-1 overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap text-muted" title={output.label}>
              {/* V2: the size is already shown; a name that only repeats the preset and the size says nothing more. */}
              {rowName(output.label, set.label)}
            </span>
            {/* UX C3 (D72): which of Main Comps' layouts this size uses; the closest one again clears a pick. */}
            <LayoutChoice output={output} readOnly={readOnly} onPick={(f) => run((d) => setOutputLayout(d, output.id, f, newId()))} />
            {/* UX A5 (F16): the state is never cut off; only the name gives way. */}
            {!connected && <span className="sc-preset__state flex-none text-[12px] text-warn">Disconnected</span>}
            {/* D51: the eye shows / hides this size's Preview on the board (it still exports); the trash removes the size. */}
            <button
              type="button"
              className={`${iconBtn({ size: ROW_BUTTON, round: 'rounded-[8px]', transition: '[transition:opacity_var(--t-fast)]' })} sc-preset__eye ml-auto ${ROW_ACTION} aria-pressed:text-muted aria-pressed:opacity-100 ${NO_CANVAS}`}
              aria-label={`${hidden.has(output.id) ? 'Show' : 'Hide'} preview ${output.label}`}
              aria-pressed={hidden.has(output.id)}
              disabled={readOnly}
              title={hidden.has(output.id) ? 'Show its preview on the board' : 'Hide its preview from the board (it still exports)'}
              onClick={() => run((d) => setPreviewHidden(d, set.id, output.id, !hidden.has(output.id)))}
            >
              <Icon name={hidden.has(output.id) ? 'eye-off' : 'eye'} />
            </button>
            {!readOnly && (
              <button
                type="button"
                className={`${iconBtn({ size: ROW_BUTTON, round: 'rounded-[8px]', transition: '[transition:opacity_var(--t-fast)]' })} sc-preset__remove ${ROW_ACTION} ${NO_CANVAS}`}
                aria-label={`Remove ${output.label} from ${set.label}`}
                title="Remove this size (deletes its preview)"
                onClick={() => window.confirm(`Remove “${output.label}”? Its preview is deleted.`) && run((d) => deleteOutput(d, output.id))}
              >
                <Icon name="trash" />
              </button>
            )}
            {!folded && (
              <Handle type="source" position={Position.Right} id={setRowHandle(output.id)} isConnectable={!readOnly && !connected} className="sc-handle--composition" title={connected ? 'Wired to its preview: cut the wire to disconnect' : 'Wire back into its preview to reconnect'} />
            )}
          </li>
        ))}
      </ol>
      {!readOnly && custom && (
        <form
          className={`sc-preset__custom mt-8 flex items-center gap-4 [&_input]:w-64 ${NO_CANVAS}`}
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <input aria-label="Width (px)" inputMode="numeric" placeholder="W" value={custom.w} autoFocus onChange={(e) => setCustom({ ...custom, w: e.target.value })} />
          <span>×</span>
          <input aria-label="Height (px)" inputMode="numeric" placeholder="H" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} />
          <button type="submit" className={btn('default', 'node')}>
            Add
          </button>
          <button type="button" className={iconBtn()} aria-label="Cancel" onClick={() => setCustom(null)}>
            <Icon name="close" />
          </button>
        </form>
      )}
      {saving.note && (
        <p className={`${MUTED_TEXT} sc-preset__note mx-0 mt-6 mb-0 text-[11px]`} role="status">
          {saving.note}
        </p>
      )}
      {!readOnly && !custom && (
        // UX B6 (F20): one way to add a size — the team's presets not on the node yet, then a custom size.
        <select
          className={`sc-preset__add mt-10 h-40! w-full cursor-pointer rounded-[10px] border-transparent! bg-accent-soft! px-14! text-[13px]! font-[600]! text-accent! [text-align-last:center] hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))]! pointer-coarse:h-44! ${NO_CANVAS}`}
          aria-label={`Add a size to ${set.label}`}
          value=""
          onChange={(e) => {
            if (e.target.value === CUSTOM) return setCustom({ w: '', h: '' });
            const p = addable.find((x) => x.id === e.target.value);
            if (p) run((d) => addSizeToSet(d, set.id, { id: newId(), label: p.name, ...presetSettings(p), size: { ...p.size } }));
          }}
        >
          <option value="">+ Add size</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={CUSTOM}>Custom size…</option>
        </select>
      )}
    </div>
  );
}

function LayoutChoice(props: { output: OutputNode; readOnly: boolean; onPick: (family: GuideFamily | null) => void }) {
  const { output } = props;
  const closest = closestLayout(output);
  const current = output.layout ?? closest;
  return (
    <span className={`${SEG} ${NO_CANVAS}`} role="group" aria-label={`Layout for ${output.label}`}>
      {GUIDE_FAMILIES.map((f) => (
        <button
          key={f}
          type="button"
          className={SEG_BUTTON}
          aria-pressed={current === f}
          data-chosen={output.layout === f || undefined}
          aria-label={`${FAMILY_LABEL[f]} layout`}
          title={f === closest ? `${FAMILY_LABEL[f]} layout (closest to its shape)` : `${FAMILY_LABEL[f]} layout`}
          disabled={props.readOnly}
          onClick={() => current !== f && props.onPick(f === closest ? null : f)}
        >
          {SHORT[f]}
        </button>
      ))}
    </span>
  );
}

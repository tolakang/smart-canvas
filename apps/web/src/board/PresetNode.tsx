/**
 * D46: a Preset node (PDF page 3, "GDN Preset Node") — a list of media sizes fed by one wire from a master
 * preview. Each row is an output wired out to its own Preview node (Edit / Export there); cutting a row's wire
 * disconnects that size (its layout freezes). Rows are dragged into another order, added from the team's presets
 * or as a custom W × H, or removed. N5: "Save as team preset" saves the node's sizes as a team preset family, so
 * it is offered as a Preset node from then on.
 */
import { addSizeToSet, deleteOutput, deletePresetSet, moveSetRow, presetFamilies, renameSet, setFamily, setPreviewHidden, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { api, ApiError } from '../api';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { useBoard } from './context';
import { setRowHandle, type SetFlowNode } from './flow';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { nameWithoutSize, presetSettings } from './OutputNode';
import { TOUCH_NO_PAN } from './pinch';

const NO_CANVAS = 'nodrag nopan nowheel';

/** A row's name without its trailing size, or '' when what is left is just the preset's name. */
export function rowName(label: string, setLabel: string): string {
  const name = nameWithoutSize(label);
  return name === setLabel.trim() ? '' : name;
}
const ROW_DRAG = 'application/x-sc-preset-row';

export function PresetNodeView({ id, data }: NodeProps<SetFlowNode>) {
  const { set, rows } = data;
  const { doc, readOnly, run, presets, reloadPresets, exportOutputs, teamId } = useBoard();
  const updateInternals = useUpdateNodeInternals();
  const rowKey = rows.map((r) => r.output.id).join(',');
  useEffect(() => updateInternals(id), [id, rowKey, updateInternals]);
  const used = new Set(rows.map((r) => r.output.presetId));
  const hidden = new Set(set.hidden ?? []);
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

  /** N5: saves the node's sizes as the team's preset family `name` (sizes the family already has are skipped). */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  async function saveAsFamily() {
    const name = window.prompt('Save these sizes as a team preset family named', set.label)?.trim();
    if (!name) return;
    const family = presetFamilies(presets).find((f) => f.label === name);
    if (family?.presets.some((p) => p.teamId === null)) return setSavedNote(`“${name}” is a built-in preset; pick another name.`);
    const has = new Set(family?.presets.map((p) => `${p.size.width}×${p.size.height}${p.size.unit}`));
    const todo = rows.filter(({ output: o }) => !has.has(`${o.size.width}×${o.size.height}${o.size.unit}`));
    try {
      for (const { output: o } of todo)
        await api('POST', `/teams/${teamId}/presets`, { group: o.size.unit === 'mm' ? 'print' : 'social', name: `${name} ${o.size.width}×${o.size.height}`, family: name, size: { ...o.size } });
      setSavedNote(`Saved as team preset “${name}” (${(family?.presets.length ?? 0) + todo.length} sizes).`);
      reloadPresets();
    } catch (err) {
      setSavedNote(err instanceof ApiError && err.status === 403 ? 'Only team admins can save presets.' : 'Could not save the preset.');
      reloadPresets();
    }
  }

  return (
    <div className="sc-node sc-node--preset" aria-label={`Preset ${set.label}`}>
      <Handle type="target" position={Position.Top} isConnectable={!readOnly} className="sc-handle--composition" title="From the Layer Comp group: feeds every size" />
      <NodeHead
        icon="grid"
        title={`${set.label} Preset`}
        sub={`${rows.length} ${rows.length === 1 ? 'size' : 'sizes'}`}
        onRename={readOnly ? undefined : (name) => run((d) => renameSet(d, set.id, name))}
        renameValue={set.label}
        renameLabel="Preset name"
        menuLabel={`${set.label} actions`}
        menu={
          readOnly
            ? []
            : [{ label: `Delete preset ${set.label}`, danger: true, onSelect: () => window.confirm(`Delete “${set.label}” and its ${rows.length} sizes?`) && run((d) => deletePresetSet(d, set.id)) }]
        }
        extra={
          rows.length > 0 && (
            <button type="button" className={`sc-head__action ${NO_CANVAS}`} onClick={() => exportOutputs(rows.map((r) => r.output.id), set.id)} aria-label={`Export all ${set.label} sizes`} title="Export every size as one ZIP">
              <Icon name="export" size={14} />
              Export
            </button>
          )
        }
      />
      {!readOnly && family && (family.label !== set.label || family.missing.length > 0) && (
        <div className={`sc-preset__family ${NO_CANVAS}`} role="group" aria-label={`Team family ${family.label}`}>
          {family.label !== set.label && (
            <button type="button" className="sc-btn sc-btn--ghost" onClick={() => run((d) => renameSet(d, set.id, family.label))} title="The team family these sizes came from has this name now">
              Rename to “{family.label}”
            </button>
          )}
          {family.missing.length > 0 && (
            <button type="button" className="sc-btn sc-btn--ghost" onClick={addMissing} title={family.missing.map((p) => p.name).join(', ')}>
              Add {family.missing.length} new {family.missing.length === 1 ? 'size' : 'sizes'}
            </button>
          )}
        </div>
      )}
      <ol className="sc-ports sc-preset__rows" aria-label={`${set.label} sizes`}>
        {rows.map(({ output, connected }, i) => (
          <li
            key={output.id}
            className={`sc-port${connected ? ' sc-port--wired' : ' sc-port--frozen'}${dropAt === i ? ' sc-port--drop' : ''}`}
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
            {/* Only the grip drags the row (the row's handle starts a wire). */}
            {!readOnly && (
              <span className={`sc-port__grip ${TOUCH_NO_PAN}`} aria-hidden="true" draggable onDragStart={(e) => e.dataTransfer.setData(ROW_DRAG, output.id)} title="Drag to re-order">
                <Icon name="grip" />
              </span>
            )}
            <span className="sc-preset__size">
              {output.size.width} × {output.size.height}
            </span>
            <span className="sc-port__label" title={output.label}>
              {/* V2: the size is already shown; a name that only repeats the preset and the size says nothing more. */}
              {[rowName(output.label, set.label), connected ? '' : 'disconnected'].filter(Boolean).join(' · ')}
            </span>
            {/* D51: the eye shows / hides this size's Preview on the board (it still exports); the trash removes the size. */}
            <button
              type="button"
              className={`sc-icon-btn sc-preset__eye ${NO_CANVAS}`}
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
                className={`sc-icon-btn sc-preset__remove ${NO_CANVAS}`}
                aria-label={`Remove ${output.label} from ${set.label}`}
                title="Remove this size (deletes its preview)"
                onClick={() => window.confirm(`Remove “${output.label}”? Its preview is deleted.`) && run((d) => deleteOutput(d, output.id))}
              >
                <Icon name="trash" />
              </button>
            )}
            <Handle type="source" position={Position.Right} id={setRowHandle(output.id)} isConnectable={!readOnly && !connected} className="sc-handle--composition" title={connected ? 'Wired to its preview: cut the wire to disconnect' : 'Wire back into its preview to reconnect'} />
          </li>
        ))}
      </ol>
      {!readOnly && custom && (
        <form
          className={`sc-preset__custom ${NO_CANVAS}`}
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <input aria-label="Width (px)" inputMode="numeric" placeholder="W" value={custom.w} autoFocus onChange={(e) => setCustom({ ...custom, w: e.target.value })} />
          <span>×</span>
          <input aria-label="Height (px)" inputMode="numeric" placeholder="H" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} />
          <button type="submit" className="sc-btn">
            Add
          </button>
          <button type="button" className="sc-icon-btn" aria-label="Cancel" onClick={() => setCustom(null)}>
            <Icon name="close" />
          </button>
        </form>
      )}
      {!readOnly && !custom && (
        <button type="button" className={`sc-btn sc-preset__add-custom ${NO_CANVAS}`} onClick={() => setCustom({ w: '', h: '' })}>
          <Icon name="plus" /> Custom size
        </button>
      )}
      {!readOnly && rows.length > 0 && (
        <button type="button" className={`sc-btn sc-preset__save ${NO_CANVAS}`} onClick={() => void saveAsFamily()}>
          <Icon name="library" /> Save as team preset
        </button>
      )}
      {savedNote && (
        <p className="sc-muted sc-preset__note" role="status">
          {savedNote}
        </p>
      )}
      {!readOnly && addable.length > 0 && (
        <select
          className={`sc-preset__add ${NO_CANVAS}`}
          aria-label={`Add a size to ${set.label}`}
          value=""
          onChange={(e) => {
            const p = addable.find((x) => x.id === e.target.value);
            if (p) run((d) => addSizeToSet(d, set.id, { id: newId(), label: p.name, ...presetSettings(p), size: { ...p.size } }));
          }}
        >
          <option value="">+ Add a size…</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

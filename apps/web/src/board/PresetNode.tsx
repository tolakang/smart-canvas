/**
 * D46: a Preset node (PDF page 3, "GDN Preset Node") — a list of media sizes fed by one wire from a master
 * preview. Each row is an output wired out to its own Preview node (Edit / Export there); cutting a row's wire
 * disconnects that size (its layout freezes). Rows are dragged into another order, added from the team's presets
 * or as a custom W × H, or removed.
 */
import { addSizeToSet, deleteOutput, deletePresetSet, moveSetRow, renameSet } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { useBoard } from './context';
import { setRowHandle, type SetFlowNode } from './flow';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { presetSettings } from './OutputNode';

const NO_CANVAS = 'nodrag nopan nowheel';
const ROW_DRAG = 'application/x-sc-preset-row';

export function PresetNodeView({ id, data }: NodeProps<SetFlowNode>) {
  const { set, rows } = data;
  const { readOnly, run, presets, exportOutputs } = useBoard();
  const updateInternals = useUpdateNodeInternals();
  const rowKey = rows.map((r) => r.output.id).join(',');
  useEffect(() => updateInternals(id), [id, rowKey, updateInternals]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== set.label) run((d) => renameSet(d, set.id, name));
  };
  const used = new Set(rows.map((r) => r.output.presetId));
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

  return (
    <div className="sc-node sc-node--preset" aria-label={`Preset ${set.label}`}>
      <Handle type="target" position={Position.Top} isConnectable={!readOnly} className="sc-handle--composition" title="From the Layer Comp group: feeds every size" />
      <div className="sc-node__head">
        {renaming !== null ? (
          <input
            className={`sc-rename ${NO_CANVAS}`}
            aria-label="Preset name"
            value={renaming}
            autoFocus
            maxLength={200}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <div className="sc-node__title" title={`${set.label}${readOnly ? '' : ' — double-click to rename'}`} onDoubleClick={() => !readOnly && setRenaming(set.label)}>
            {set.label} Preset
          </div>
        )}
        {rows.length > 0 && (
          <button type="button" className={`sc-open-editor ${NO_CANVAS}`} onClick={() => exportOutputs(rows.map((r) => r.output.id))} aria-label={`Export all ${set.label} sizes`} title="Export every size">
            Export
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`Delete preset ${set.label}`}
            title="Delete this preset node and its sizes"
            onClick={() => window.confirm(`Delete “${set.label}” and its ${rows.length} sizes?`) && run((d) => deletePresetSet(d, set.id))}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="sc-node__meta">Media size (W×H) · {rows.length} {rows.length === 1 ? 'size' : 'sizes'}</div>
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
              <span className="sc-port__grip" aria-hidden="true" draggable onDragStart={(e) => e.dataTransfer.setData(ROW_DRAG, output.id)} title="Drag to re-order">
                <Icon name="grip" />
              </span>
            )}
            <span className="sc-preset__size">
              {output.size.width} × {output.size.height}
            </span>
            <span className="sc-port__label" title={output.label}>
              {connected ? output.label : `${output.label} · disconnected`}
            </span>
            {!readOnly && (
              <button
                type="button"
                className={`sc-icon-btn sc-preset__remove ${NO_CANVAS}`}
                aria-label={`Remove ${output.label} from ${set.label}`}
                title="Remove this size (deletes its preview)"
                onClick={() => window.confirm(`Remove “${output.label}”? Its preview is deleted.`) && run((d) => deleteOutput(d, output.id))}
              >
                <Icon name="close" />
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

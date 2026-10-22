/**
 * D46: a Preset node (PDF page 3, "GDN Preset Node") — a list of media sizes fed by one wire from a master
 * preview. Each row is an output wired out to its own Preview node (Edit / Export there); cutting a row's wire
 * disconnects that size (its layout freezes). Rows can be added from the team's presets, or removed.
 */
import { addSizeToSet, deleteOutput, deletePresetSet, renameSet } from '@smart-canvas/core';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { useBoard } from './context';
import { setRowHandle, type SetFlowNode } from './flow';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { presetSettings } from './OutputNode';

const NO_CANVAS = 'nodrag nopan nowheel';

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
  const addable = presets.filter((p) => p.size.unit === 'px' && !used.has(p.id));

  return (
    <div className="sc-node sc-node--preset" aria-label={`Preset ${set.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly} className="sc-handle--composition" title="Master preview in: feeds every size" />
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
            {set.label}
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
        {rows.map(({ output, connected }) => (
          <li key={output.id} className={`sc-port${connected ? ' sc-port--wired' : ' sc-port--frozen'}`} data-output={output.id}>
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

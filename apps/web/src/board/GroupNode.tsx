/**
 * A board group (T13.7): a coloured frame behind its nodes with a header — name (double-click to rename),
 * how many nodes, colour, collapse / expand, "Export" (the outputs in it) and "Ungroup". Collapsed, the nodes
 * hide and the frame shrinks to its header. Drag the frame (its header) to move the whole group.
 */
import { GROUP_COLORS, ungroup, updateGroup, type GroupColor } from '@smart-canvas/core';
import type { NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { useBoard } from './context';
import type { GroupFlowNode } from './flow';
import { Icon } from './LayerRow';
import { NO_CANVAS } from './pinch';


/** A group (T13.7): a frame tinted in its colour behind its nodes, with a header to drag, rename, collapse or export. */
const GROUP = 'size-full rounded-lg [border:1.5px_solid_color-mix(in_srgb,var(--group)_70%,transparent)] bg-[color-mix(in_srgb,var(--group)_8%,transparent)]';
const GROUP_TINT: Record<GroupColor, string> = {
  grey: '[--group:var(--faint)]',
  blue: '[--group:var(--type-input)]',
  purple: '[--group:var(--type-main)]',
  green: '[--group:var(--type-output)]',
  orange: '[--group:var(--type-process)]',
  red: '[--group:var(--danger)]',
};
/** The header React Flow drags the group by (`dragHandle`, flow.ts). */
const HEAD =
  'sc-group__head flex h-40 cursor-grab items-center gap-(--sp-2) bg-[color-mix(in_srgb,var(--group)_18%,var(--surface))] py-0 pr-(--sp-2) pl-(--sp-3) text-md font-[600]';

export function GroupNodeView({ data }: NodeProps<GroupFlowNode>) {
  const { group, outputs } = data;
  const { readOnly, run, exportOutputs } = useBoard();
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== group.label) run((d) => updateGroup(d, group.id, { label: name }));
  };
  const nextColor = GROUP_COLORS[(GROUP_COLORS.indexOf(group.color) + 1) % GROUP_COLORS.length] ?? 'grey';
  return (
    <div className={`sc-group sc-group--${group.color}${group.collapsed ? ' sc-group--collapsed' : ''} ${GROUP} ${GROUP_TINT[group.color]}`} aria-label={`Group ${group.label}`}>
      <div className={`${HEAD} ${group.collapsed ? 'rounded-lg' : 'rounded-t-lg'}`}>
        {renaming !== null ? (
          <input
            className={`sc-rename ${NO_CANVAS}`}
            aria-label="Group name"
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
          <span className="sc-group__title overflow-hidden text-ellipsis whitespace-nowrap" title={readOnly ? group.label : `${group.label} — double-click to rename`} onDoubleClick={() => !readOnly && setRenaming(group.label)}>
            {group.label}
          </span>
        )}
        <span className="sc-group__count rounded-[99px] bg-surface px-6 py-0 text-xs font-[500] text-muted">{group.nodes.length}</span>
        <span className="sc-group__actions ml-auto flex gap-2">
          {!readOnly && (
            <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Group colour: ${group.color}`} title={`Colour (next: ${nextColor})`} onClick={() => run((d) => updateGroup(d, group.id, { color: nextColor }))}>
              <span className="sc-group__swatch block size-12 rounded-[50%] bg-(--group)" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} group ${group.label}`}
            aria-expanded={!group.collapsed}
            title={group.collapsed ? 'Expand' : 'Collapse'}
            disabled={readOnly}
            onClick={() => run((d) => updateGroup(d, group.id, { collapsed: !group.collapsed }))}
          >
            <Icon name={group.collapsed ? 'plus' : 'minus'} />
          </button>
          {outputs.length > 0 && (
            <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Export group ${group.label}`} title={`Export its ${outputs.length} Preview${outputs.length === 1 ? '' : 's'}`} onClick={() => exportOutputs(outputs)}>
              <Icon name="export" />
            </button>
          )}
          {!readOnly && (
            <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Ungroup ${group.label}`} title="Ungroup (the nodes stay)" onClick={() => run((d) => ungroup(d, group.id))}>
              <Icon name="close" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

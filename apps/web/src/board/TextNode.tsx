/**
 * D49: the Text node (owner: "text node for text only, it can add more text slots"). All its slots are in this one
 * node; each slot is its own text layer — moved, sized, styled, locked or hidden in each layout on its own, with its
 * own overrides in each Preview. A slot grows with what is typed in it (on the card), and in every layout its text
 * wraps in its box and shrinks to fit (the engine's text fit). + Add text adds a slot; × deletes one.
 */
import { addTextToStack, deleteSource, deleteStack, fontStack, renameStack } from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { setText } from './content';
import { cardClass } from './card';
import { useBoard } from './context';
import type { StackFlowNode } from './flow';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { NO_CANVAS } from './pinch';


/** Its Delete: shown on hover or while typing (on touch: while typing, or once the slot is selected). */
const REMOVE =
  'sc-text-slot__remove absolute top-30 right-7 grid size-28 cursor-pointer place-items-center rounded-[8px] bg-transparent p-0 text-muted opacity-0 [border:0] [transition:opacity_var(--t-fast),background_var(--t-fast),color_var(--t-fast)] group-hover/text:opacity-100 group-focus-within/text:opacity-100 hover:bg-danger-soft hover:text-danger';
/** The field grows with its text (the card's field look underneath). */
const INPUT =
  'sc-text-slot__input min-h-42 w-full resize-none overflow-hidden pt-10 pr-40 pb-10 pl-12 [field-sizing:content] focus:[box-shadow:0_0_0_3px_var(--ring)]';

export function TextNodeView({ data, selected }: NodeProps<StackFlowNode>) {
  const { stack, items } = data;
  const { readOnly, run, editSource, stackFocus, setStackFocus } = useBoard();

  return (
    <div className={`${cardClass('input')} sc-node--text-node`} aria-label={`Text node ${stack.label}`}>
      <NodeHead
        icon="text"
        title={stack.label}
        sub={`${items.length} ${items.length === 1 ? 'text' : 'texts'}`}
        onRename={readOnly ? undefined : (name) => run((d) => renameStack(d, stack.id, name))}
        renameLabel="Text node name"
        menuLabel={`${stack.label} actions`}
        menu={readOnly ? [] : [{ label: `Delete ${stack.label}`, danger: true, onSelect: () => confirmDelete(stack.label) && run((d) => deleteStack(d, stack.id)) }]}
      />
      <ol className={`sc-text-slots m-0 grid list-none gap-12 p-0 ${NO_CANVAS}`} aria-label={`${stack.label} slots`}>
        {items.map((s) => {
          if (s.content.kind !== 'text') return null;
          const { style, text } = s.content;
          const focused = selected && stackFocus === s.id;
          return (
            <li
              key={s.id}
              className={`sc-text-slot group/text relative grid gap-6 rounded-[8px] p-0 ${focused ? ' sc-assets__item--focus [outline:2px_solid_var(--accent)] outline-offset-1' : ''}${s.visible ? '' : ' sc-assets__item--hidden opacity-45'}`}
            >
              <span className="sc-text-slot__label text-[12px] font-[600] text-muted">{s.label}</span>
              <textarea
                className={INPUT}
                aria-label={`${s.label} text`}
                value={text}
                readOnly={readOnly}
                placeholder="Type text…"
                lang={style.language === 'km' ? 'km' : undefined}
                style={{ fontFamily: fontStack(style.fontFamily), fontWeight: style.fontWeight }}
                // Grows with its lines (field-sizing where supported; rows as the fallback).
                rows={Math.max(1, text.split('\n').length)}
                onFocus={() => setStackFocus(s.id)}
                onChange={(e) => editSource(s.id, (x) => setText(x, e.target.value))}
              />
              {!readOnly && (
                <button type="button" className={`${REMOVE}${focused ? ' [@media(hover:none)]:opacity-100' : ''}`} aria-label={`Delete ${s.label}`} title="Delete this text" onClick={() => confirmDelete(s.label) && run((d) => deleteSource(d, s.id))}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <button type="button" className={`sc-btn sc-btn--soft sc-text-slots__add w-full justify-center ${NO_CANVAS}`} onClick={() => run((d) => addTextToStack(d, stack.id, { id: newId() }))}>
          <Icon name="plus" /> Add text
        </button>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every text into Main Comps" />
    </div>
  );
}

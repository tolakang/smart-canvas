/**
 * D49: the Text node (owner: "text node for text only, it can add more text slots"). All its slots are in this one
 * node; each slot is its own text layer — moved, sized, styled, locked or hidden in each layout on its own, with its
 * own overrides in each Preview. A slot grows with what is typed in it (on the card), and in every layout its text
 * wraps in its box and shrinks to fit (the engine's text fit). + Add text adds a slot; × deletes one.
 */
import { addTextToStack, deleteSource, deleteStack, fontStack, renameStack } from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { setText } from './content';
import { useBoard } from './context';
import type { StackFlowNode } from './flow';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

export function TextNodeView({ data, selected }: NodeProps<StackFlowNode>) {
  const { stack, items } = data;
  const { readOnly, run, editSource, stackFocus, setStackFocus } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stack.label);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== stack.label) run((d) => renameStack(d, stack.id, draft));
  };

  return (
    <div className="sc-node sc-node--input sc-node--text-node" aria-label={`Text node ${stack.label}`}>
      <div className="sc-node__head">
        {editing ? (
          <input className={`sc-rename ${NO_CANVAS}`} aria-label="Text node name" value={draft} autoFocus maxLength={200} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setEditing(false))} />
        ) : (
          <div className="sc-node__title" title={readOnly ? stack.label : `${stack.label} — double-click to rename`} onDoubleClick={() => !readOnly && (setDraft(stack.label), setEditing(true))}>
            {stack.label}
          </div>
        )}
        {!readOnly && (
          <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Delete ${stack.label}`} title="Delete this node and its text" onClick={() => confirmDelete(stack.label) && run((d) => deleteStack(d, stack.id))}>
            <Icon name="trash" />
          </button>
        )}
      </div>
      <ol className={`sc-text-slots ${NO_CANVAS}`} aria-label={`${stack.label} slots`}>
        {items.map((s) => {
          if (s.content.kind !== 'text') return null;
          const { style, text } = s.content;
          const focused = selected && stackFocus === s.id;
          return (
            <li key={s.id} className={`sc-text-slot${focused ? ' sc-assets__item--focus' : ''}${s.visible ? '' : ' sc-assets__item--hidden'}`}>
              <span className="sc-text-slot__label">{s.label}</span>
              <textarea
                className="sc-text-slot__input"
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
                <button type="button" className="sc-icon-btn sc-text-slot__remove" aria-label={`Delete ${s.label}`} title="Delete this text" onClick={() => confirmDelete(s.label) && run((d) => deleteSource(d, s.id))}>
                  <Icon name="close" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <button type="button" className={`sc-btn sc-text-slots__add ${NO_CANVAS}`} onClick={() => run((d) => addTextToStack(d, stack.id, { id: newId() }))}>
          <Icon name="plus" /> Add text
        </button>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every text into the Layer Comp" />
    </div>
  );
}

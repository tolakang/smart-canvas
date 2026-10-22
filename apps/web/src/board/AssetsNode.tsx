/**
 * D40: an Assets card — one board node holding many pictures. Drop several files on it (or pick them) and each
 * becomes its own layer, wired into the card's master previews. Click a picture to set it in the inspector,
 * drag pictures to reorder the card, × deletes one.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { deleteSource, moveStackItem, renameStack } from '@smart-canvas/core';
import { useState, type DragEvent } from 'react';
import { assetUrl } from '../api';
import { useBoard } from './context';
import type { StackFlowNode } from './flow';
import { confirmDelete, Icon } from './LayerRow';
import { carriesFiles, filesOf, PICTURE_ACCEPT, usePictureDrop } from './stack-upload';

const NO_CANVAS = 'nodrag nopan nowheel';
const ITEM_DRAG = 'application/x-sc-stack-item';

export function AssetsNodeView({ data, selected }: NodeProps<StackFlowNode>) {
  const { stack, items } = data;
  const { teamId, readOnly, run, stackFocus, setStackFocus } = useBoard();
  const drop = usePictureDrop();
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stack.label);

  const dropProps = readOnly
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          void drop.add(filesOf(e), { stackId: stack.id });
        },
      };

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== stack.label) run((d) => renameStack(d, stack.id, draft));
  };

  return (
    <div className={`sc-node sc-node--input sc-node--assets${over ? ' sc-node--drop' : ''}`} {...dropProps}>
      <div className="sc-node__head">
        {editing ? (
          <input
            className={`sc-rename ${NO_CANVAS}`}
            aria-label="Assets name"
            value={draft}
            autoFocus
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setEditing(false))}
          />
        ) : (
          <div className="sc-node__title" title={readOnly ? stack.label : `${stack.label} — double-click to rename`} onDoubleClick={() => !readOnly && (setDraft(stack.label), setEditing(true))}>
            {stack.label}
          </div>
        )}
        <span className="sc-count" aria-label={`${items.length} pictures`}>
          {items.length}
        </span>
      </div>
      <ul className={`sc-assets ${NO_CANVAS}`} aria-label={`${stack.label} pictures`}>
        {items.map((s, i) => {
          const asset = s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null;
          const focused = selected && (stackFocus === s.id || (!items.some((x) => x.id === stackFocus) && i === 0));
          return (
            <li
              key={s.id}
              className={`sc-assets__item${focused ? ' sc-assets__item--focus' : ''}${s.visible ? '' : ' sc-assets__item--hidden'}`}
              draggable={!readOnly}
              onDragStart={(e) => e.dataTransfer.setData(ITEM_DRAG, s.id)}
              onDragOver={(e) => e.dataTransfer.types.includes(ITEM_DRAG) && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(ITEM_DRAG);
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                run((d) => moveStackItem(d, stack.id, id, i));
              }}
            >
              <button type="button" className="sc-assets__pick" title={s.label} aria-label={`Select ${s.label}`} onClick={() => setStackFocus(s.id)}>
                {asset ? <img src={assetUrl(teamId, asset)} alt={`${s.label} preview`} draggable={false} /> : <span className="sc-muted">?</span>}
              </button>
              {!readOnly && (
                <button type="button" className="sc-assets__remove" aria-label={`Delete ${s.label}`} title="Delete" onClick={() => confirmDelete(s.label) && run((d) => deleteSource(d, s.id))}>
                  <Icon name="close" />
                </button>
              )}
            </li>
          );
        })}
        {!readOnly && (
          <li className="sc-assets__item">
            <label className="sc-assets__add" title="Add pictures (or drop files on the card)">
              {drop.busy ? '…' : <Icon name="plus" />}
              <input
                type="file"
                multiple
                accept={PICTURE_ACCEPT}
                aria-label={`Add pictures to ${stack.label}`}
                hidden
                disabled={drop.busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void drop.add(files, { stackId: stack.id });
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {items.length === 0 && !readOnly && <p className="sc-muted sc-assets__hint">{drop.busy ? 'Uploading…' : 'Drop pictures here — as many as you like'}</p>}
      {drop.busy && items.length > 0 && <p className="sc-muted sc-assets__hint">Uploading…</p>}
      {drop.errors.length > 0 && (
        <p className="sc-error" role="alert">
          {drop.errors.join(' ')}
        </p>
      )}
      <Handle type="source" position={Position.Right} isConnectable={!readOnly} className="sc-handle--layer" title="Layers out: wire every picture into a master preview" />
    </div>
  );
}

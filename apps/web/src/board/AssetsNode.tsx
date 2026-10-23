/**
 * D40 / D49: an Image node (or a Logo node: its pictures behave as logos) — one board node holding many pictures. Drop several files on it (or pick them) and each
 * becomes its own layer, wired into the Layer Comp (and its layouts). Click a picture to set it in the inspector,
 * drag pictures to reorder the card, × deletes one. Page 3: a grid / list switch (remembered per card, in this browser).
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { deleteSource, deleteStack, moveStackItem, renameStack, stackKind } from '@smart-canvas/core';
import { useState, type DragEvent } from 'react';
import { useStoredFlag } from './board-keys';
import { assetUrl, uploadAsset } from '../api';
import { setPicture, withSource } from './content';
import { useBoard } from './context';
import type { StackFlowNode } from './flow';
import { confirmDelete, Icon } from './LayerRow';
import { carriesFiles, filesOf, PICTURE_ACCEPT, usePictureDrop } from './stack-upload';

const NO_CANVAS = 'nodrag nopan nowheel';
const ITEM_DRAG = 'application/x-sc-stack-item';

export function AssetsNodeView({ data, selected }: NodeProps<StackFlowNode>) {
  const { stack, items } = data;
  const { teamId, readOnly, run, stackFocus, setStackFocus, rememberAsset } = useBoard();
  const [replacing, setReplacing] = useState<string | null>(null);
  /** D49: a picture replaced in place (its layer keeps its position and overrides). */
  const replace = async (id: string, file: File) => {
    setReplacing(id);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return;
      rememberAsset(asset);
      const kind = asset.kind;
      run((d) => ({ ok: true, doc: withSource(d, id, (x) => setPicture(x, asset.id, kind)) }));
    } catch {
      // the drop zone's errors cover failed uploads; a failed replace leaves the picture as it was
    } finally {
      setReplacing(null);
    }
  };
  const isLogo = stackKind(stack) === 'logo';
  const drop = usePictureDrop();
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stack.label);
  const [list, setList] = useStoredFlag(`sc-assets-list:${stack.id}`, false);

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
        {!readOnly && (
          <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Delete ${stack.label}`} title="Delete this node and its pictures" onClick={() => confirmDelete(stack.label) && run((d) => deleteStack(d, stack.id))}>
            <Icon name="trash" />
          </button>
        )}
        <div className={`sc-seg sc-assets__view ${NO_CANVAS}`} role="group" aria-label={`${stack.label} view`}>
          <button type="button" aria-pressed={!list} aria-label="Grid view" title="Grid" onClick={() => setList(false)}>
            ▦
          </button>
          <button type="button" aria-pressed={list} aria-label="List view" title="List" onClick={() => setList(true)}>
            ☰
          </button>
        </div>
      </div>
      <ul className={`sc-assets${list ? ' sc-assets--list' : ''} ${NO_CANVAS}`} aria-label={`${stack.label} pictures`}>
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
              {list && <span className="sc-assets__label">{replacing === s.id ? 'Replacing…' : s.label}</span>}
              {!readOnly && (
                <label className="sc-assets__replace" title="Replace this picture (keeps its place in every layout)">
                  <Icon name="undo" />
                  <input
                    type="file"
                    accept={PICTURE_ACCEPT}
                    aria-label={`Replace ${s.label}`}
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void replace(s.id, file);
                    }}
                  />
                </label>
              )}
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
              {list && <span>Drag &amp; drop or add pictures</span>}
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
      {!readOnly && <p className="sc-muted sc-assets__hint">{drop.busy ? 'Uploading…' : `+ Drag & drop ${isLogo ? 'logos' : 'pictures'} · PNG, JPG, WebP, SVG, PDF`}</p>}
      {drop.errors.length > 0 && (
        <p className="sc-error" role="alert">
          {drop.errors.join(' ')}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every picture into the Layer Comp" />
    </div>
  );
}

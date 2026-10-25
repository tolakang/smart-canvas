/**
 * D40 / D49: an Image node (or a Logo node: its pictures behave as logos) — one board node holding many pictures. Drop several files on it (or pick them) and each
 * becomes its own layer, wired into the Layer Comp (and its layouts). Click a picture to set it in the inspector,
 * drag pictures to reorder the card. V1: each slot's Replace / Remove picture / Delete show on hover or once tapped;
 * grid / list (remembered per card, in this browser) and Delete node are in the ⋯ menu.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { deleteSource, deleteStack, moveStackItem, renameStack, stackKind } from '@smart-canvas/core';
import { useState, type DragEvent } from 'react';
import { useStoredFlag } from './board-keys';
import { assetUrl, uploadAsset } from '../api';
import { setAsset, setPicture, withSource } from './content';
import { useBoard } from './context';
import type { StackFlowNode } from './flow';
import { confirmDelete, Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { Slot } from './Slot';
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

  const n = items.length;
  const noun = isLogo ? (n === 1 ? 'logo' : 'logos') : n === 1 ? 'picture' : 'pictures';

  return (
    <div className={`sc-node sc-node--input sc-node--assets${over ? ' sc-node--drop' : ''}`} {...dropProps}>
      <NodeHead
        icon="image"
        title={stack.label}
        sub={`${n} ${noun}`}
        onRename={readOnly ? undefined : (name) => run((d) => renameStack(d, stack.id, name))}
        renameLabel="Assets name"
        menuLabel={`${stack.label} actions`}
        menu={[
          { label: list ? 'Grid view' : 'List view', onSelect: () => setList(!list) },
          ...(readOnly ? [] : [{ label: `Delete ${stack.label}`, danger: true, separated: true, onSelect: () => confirmDelete(stack.label) && run((d) => deleteStack(d, stack.id)) }]),
        ]}
      />
      <ul className={`sc-assets${list ? ' sc-assets--list' : ''} ${NO_CANVAS}`} aria-label={`${stack.label} pictures`}>
        {items.map((s, i) => {
          const asset = s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null;
          const focused = selected && (stackFocus === s.id || (!items.some((x) => x.id === stackFocus) && i === 0));
          return (
            <li key={s.id} className="sc-assets__item">
              <Slot
                src={asset ? assetUrl(teamId, asset) : null}
                alt={`${s.label} preview`}
                busy={replacing === s.id}
                focused={Boolean(focused)}
                dimmed={!s.visible}
                readOnly={readOnly}
                accept={PICTURE_ACCEPT}
                label={list ? s.label : undefined}
                names={{ select: `Select ${s.label}`, file: `Replace ${s.label}`, remove: `Remove picture from ${s.label}`, delete: `Delete ${s.label}` }}
                onSelect={() => setStackFocus(s.id)}
                onFile={(file) => void replace(s.id, file)}
                onRemovePicture={() => run((d) => ({ ok: true, doc: withSource(d, s.id, (x) => setAsset(x, null)) }))}
                onDelete={() => confirmDelete(s.label) && run((d) => deleteSource(d, s.id))}
                itemProps={{
                  draggable: !readOnly,
                  onDragStart: (e: DragEvent) => e.dataTransfer.setData(ITEM_DRAG, s.id),
                  onDragOver: (e: DragEvent) => e.dataTransfer.types.includes(ITEM_DRAG) && e.preventDefault(),
                  onDrop: (e: DragEvent) => {
                    const id = e.dataTransfer.getData(ITEM_DRAG);
                    if (!id) return;
                    e.preventDefault();
                    e.stopPropagation();
                    run((d) => moveStackItem(d, stack.id, id, i));
                  },
                }}
              />
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        // One drop area: click to pick, or drop files anywhere on the card.
        <label className={`sc-dropzone ${NO_CANVAS}${drop.busy ? ' sc-dropzone--busy' : ''}`}>
          <span className="sc-dropzone__icon" aria-hidden="true">
            {drop.busy ? <span className="sc-spinner" /> : <Icon name="plus" />}
          </span>
          <span className="sc-dropzone__text">
            <strong>{drop.busy ? 'Uploading…' : isLogo ? 'Add or drop logos' : 'Add or drop pictures'}</strong>
            <span>PNG, JPG, WebP, SVG, PDF</span>
          </span>
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
      )}
      {drop.errors.length > 0 && (
        <p className="sc-error" role="alert">
          {drop.errors.join(' ')}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every picture into the Layer Comp" />
    </div>
  );
}

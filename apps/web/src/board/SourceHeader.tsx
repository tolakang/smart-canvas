import { renameSource, type InputSource } from '@smart-canvas/core';
import { useState, type KeyboardEvent } from 'react';
import { useBoard } from './context';
import { Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

/**
 * Input node title. Double-click renames it in place; hidden and library inputs show a small mark. The
 * actions (rename, show / hide, duplicate, save to library, delete) are in the inspector and the node's
 * right-click menu, and Delete / Backspace deletes the selected nodes.
 */
export function SourceHeader({ source }: { source: InputSource }) {
  const { readOnly, run } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source.label);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== source.label) run((doc) => renameSource(doc, source.id, draft));
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <div className="sc-node__head">
      {editing ? (
        <input
          className={`sc-rename ${NO_CANVAS}`}
          aria-label="Input name"
          value={draft}
          autoFocus
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      ) : (
        <div className="sc-node__title" title={readOnly ? source.label : `${source.label} — double-click to rename`} onDoubleClick={() => !readOnly && (setDraft(source.label), setEditing(true))}>
          {source.label}
        </div>
      )}
      {!source.visible && (
        <span className="sc-node__mark" title="Hidden everywhere" aria-label="Hidden">
          <Icon name="eye-off" />
        </span>
      )}
      {source.libraryItemId && (
        <span className="sc-node__mark" title="From the team library" aria-label="From library">
          <Icon name="library" />
        </span>
      )}
    </div>
  );
}

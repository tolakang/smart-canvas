import { deleteSource, duplicateSource, libraryEntryOf, LIMITS, renameSource, setSourceVisible, type InputSource } from '@smart-canvas/core';
import { api } from '../api';
import { useState, type KeyboardEvent } from 'react';
import { useBoard } from './context';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';

/** Input node title with rename / hide / duplicate / delete (D8: defaults included). */
export function SourceHeader({ source }: { source: InputSource }) {
  const { readOnly, run, sourceCount, teamId } = useBoard();
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');
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
  function remove() {
    if (confirmDelete(source.label)) {
      run((doc) => deleteSource(doc, source.id));
    }
  }

  async function saveToLibrary() {
    const name = window.prompt('Save to the team library as', source.label);
    if (name === null) return;
    try {
      await api('POST', `/teams/${teamId}/library`, { ...libraryEntryOf(source, name), tags: [] });
      setSaved('saved');
    } catch {
      setSaved('failed');
    }
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
        <div className="sc-node__title">{source.label}</div>
      )}
      {!readOnly && !editing && (
        <div className={`sc-actions ${NO_CANVAS}`}>
          <button
            type="button"
            title="Rename"
            aria-label={`Rename ${source.label}`}
            onClick={() => {
              setDraft(source.label);
              setEditing(true);
            }}
          >
            ✎
          </button>
          <button
            type="button"
            title={source.visible ? 'Hide' : 'Show'}
            aria-label={`${source.visible ? 'Hide' : 'Show'} ${source.label}`}
            aria-pressed={!source.visible}
            onClick={() => run((doc) => setSourceVisible(doc, source.id, !source.visible))}
          >
            <Icon name={source.visible ? 'eye' : 'eye-off'} />
          </button>
          <button
            type="button"
            title={sourceCount >= LIMITS.maxSources ? `${LIMITS.maxSources} inputs max` : 'Duplicate'}
            aria-label={`Duplicate ${source.label}`}
            disabled={sourceCount >= LIMITS.maxSources}
            onClick={() => run((doc) => duplicateSource(doc, source.id, newId()))}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            title={saved === 'saved' ? 'Saved to the team library' : saved === 'failed' ? 'Could not save — try again' : 'Save to team library'}
            aria-label={`Save ${source.label} to library`}
            onClick={() => void saveToLibrary()}
          >
            {saved === 'saved' ? '✓' : '📚'}
          </button>
          <button type="button" title="Delete" aria-label={`Delete ${source.label}`} onClick={remove}>
            <Icon name="trash" />
          </button>
        </div>
      )}
    </div>
  );
}

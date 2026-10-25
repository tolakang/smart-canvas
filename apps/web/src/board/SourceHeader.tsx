import { deleteSource, renameSource, type InputSource } from '@smart-canvas/core';
import { useBoard } from './context';
import { confirmDelete, Icon, type IconName } from './LayerRow';
import { NodeHead } from './NodeHead';

const KIND_ICON: Record<InputSource['kind'], IconName> = { image: 'image', vector: 'vector', text: 'text', fill: 'fill' };
const ROLE: Record<InputSource['behavesLike'], string> = { background: 'Square, vertical & horizontal', subject: 'Subject', text: 'Text', logo: 'Logo', decoration: 'Decoration' };

/**
 * Input node title (V1: the shared NodeHead — the name, a quiet line under it, Delete in the ⋯ menu). Double-click
 * renames it in place; hidden and library inputs show a small mark. The other actions (show / hide, duplicate,
 * save to library) are in the inspector and the node's right-click menu, and Delete / Backspace deletes the
 * selected nodes.
 */
export function SourceHeader({ source }: { source: InputSource }) {
  const { readOnly, run } = useBoard();
  return (
    <NodeHead
      icon={source.behavesLike === 'background' ? 'fill' : KIND_ICON[source.kind]}
      title={source.label}
      sub={ROLE[source.behavesLike]}
      onRename={readOnly ? undefined : (name) => run((doc) => renameSource(doc, source.id, name))}
      renameLabel="Input name"
      menuLabel={`${source.label} actions`}
      menu={readOnly ? [] : [{ label: `Delete ${source.label}`, danger: true, onSelect: () => confirmDelete(source.label) && run((doc) => deleteSource(doc, source.id)) }]}
      extra={
        <>
          {!source.visible && (
            <span className="sc-node__mark" title="Hidden everywhere" aria-label="Hidden">
              <Icon name="eye-off" size={14} />
            </span>
          )}
          {source.libraryItemId && (
            <span className="sc-node__mark" title="From the team library" aria-label="From library">
              <Icon name="library" size={14} />
            </span>
          )}
        </>
      }
    />
  );
}

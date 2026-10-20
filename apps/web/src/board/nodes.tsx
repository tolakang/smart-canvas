import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { ALLOWED_BEHAVIORS, portOf, setBehavior, type Behavior, type InputSource } from '@smart-canvas/core';
import { AssetEditor, FillEditor, TextEditor, useAssetUpload, type AssetUpload } from './editors';
import { useBoard } from './context';
import { MainNodeView } from './MainNode';
import { SourceHeader } from './SourceHeader';
import type { InputFlowNode } from './flow';
import { OutputNodeView } from './OutputNode';

function InputNodeView({ data }: NodeProps<InputFlowNode>) {
  const { source } = data;
  const { readOnly, run, doc } = useBoard();
  const port = portOf(doc, source.id);
  // T8.3: drop an image file anywhere on a picture input (or a photo on a fill background, D9).
  const upload = useAssetUpload(source);
  return (
    <div className={`sc-node sc-node--input${source.visible ? '' : ' sc-node--hidden'}${upload.over ? ' sc-node--drop' : ''}`} {...upload.dropProps}>
      <SourceHeader source={source} />
      <div className="sc-node__meta">
        {source.kind} ·{' '}
        {readOnly || ALLOWED_BEHAVIORS[source.kind].length < 2 ? (
          BEHAVIOR_LABEL[source.behavesLike].toLowerCase()
        ) : (
          // T8.7: how this input adapts in outputs (its behaviour's rules), changeable any time.
          <select
            className="sc-behavior nodrag nopan nowheel"
            aria-label={`${source.label} behaves like`}
            title="How this input adapts in outputs"
            value={source.behavesLike}
            onChange={(e) => run((doc) => setBehavior(doc, source.id, e.target.value as Behavior))}
          >
            {ALLOWED_BEHAVIORS[source.kind].map((b) => (
              <option key={b} value={b}>
                {BEHAVIOR_LABEL[b]}
              </option>
            ))}
          </select>
        )}{' '}
        <span title={`Port ${port} on the main preview (0 = front)`}>· layer {port + 1}</span>
        {!source.visible && ' · hidden'}
        {source.libraryItemId && ' · from library'}
      </div>
      <SourceEditor source={source} upload={upload} />
      <Handle type="source" position={Position.Right} isConnectable={!readOnly} />
    </div>
  );
}

const BEHAVIOR_LABEL: Record<Behavior, string> = { background: 'Background', subject: 'Subject', text: 'Text', logo: 'Logo', decoration: 'Decoration' };

function SourceEditor({ source, upload }: { source: InputSource; upload: AssetUpload }) {
  const { content } = source;
  switch (content.kind) {
    case 'image':
    case 'vector':
      return <AssetEditor source={{ ...source, content }} upload={upload} />;
    case 'text':
      return <TextEditor source={{ ...source, content }} />;
    case 'fill':
      return <FillEditor source={{ ...source, content }} upload={upload} />;
  }
}

export const nodeTypes: NodeTypes = { inputNode: InputNodeView, mainNode: MainNodeView, outputNode: OutputNodeView };

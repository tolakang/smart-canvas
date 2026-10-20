import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import type { InputSource } from '@smart-canvas/core';
import { AssetEditor, FillEditor, TextEditor, useAssetUpload, type AssetUpload } from './editors';
import { useBoard } from './context';
import { MainNodeView } from './MainNode';
import { SourceHeader } from './SourceHeader';
import type { InputFlowNode } from './flow';
import { OutputNodeView } from './OutputNode';

function InputNodeView({ data }: NodeProps<InputFlowNode>) {
  const { source } = data;
  const { readOnly } = useBoard();
  // T8.3: drop an image file anywhere on a picture input (or a photo on a fill background, D9).
  const upload = useAssetUpload(source);
  return (
    <div className={`sc-node sc-node--input${source.visible ? '' : ' sc-node--hidden'}${upload.over ? ' sc-node--drop' : ''}`} {...upload.dropProps}>
      <SourceHeader source={source} />
      <div className="sc-node__meta">
        {source.kind} · {source.behavesLike} · port {source.port}
        {!source.visible && ' · hidden'}
        {source.libraryItemId && ' · from library'}
      </div>
      <SourceEditor source={source} upload={upload} />
      <Handle type="source" position={Position.Right} isConnectable={!readOnly} />
    </div>
  );
}

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

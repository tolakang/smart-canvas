import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import type { InputSource } from '@smart-canvas/core';
import { AssetEditor, FillEditor, TextEditor } from './editors';
import { SourceHeader } from './SourceHeader';
import type { InputFlowNode, MainFlowNode, OutputFlowNode } from './flow';

const sizeLabel = (s: { width: number; height: number; unit: string }) => `${s.width} × ${s.height} ${s.unit}`;

function InputNodeView({ data }: NodeProps<InputFlowNode>) {
  const { source } = data;
  return (
    <div className={`sc-node sc-node--input${source.visible ? '' : ' sc-node--hidden'}`}>
      <SourceHeader source={source} />
      <div className="sc-node__meta">
        {source.kind} · {source.behavesLike} · port {source.port}
        {!source.visible && ' · hidden'}
      </div>
      <SourceEditor source={source} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function SourceEditor({ source }: { source: InputSource }) {
  const { content } = source;
  switch (content.kind) {
    case 'image':
    case 'vector':
      return <AssetEditor source={{ ...source, content }} />;
    case 'text':
      return <TextEditor source={{ ...source, content }} />;
    case 'fill':
      return <FillEditor source={{ ...source, content }} />;
  }
}

function MainNodeView({ data }: NodeProps<MainFlowNode>) {
  return (
    <div className="sc-node sc-node--main">
      <Handle type="target" position={Position.Left} />
      <div className="sc-node__title">Main preview</div>
      <div className="sc-node__meta">{sizeLabel(data.size)}</div>
      <div className="sc-node__meta">
        {data.inputs} inputs · {data.outputs} outputs
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function OutputNodeView({ data }: NodeProps<OutputFlowNode>) {
  const { output, connected } = data;
  return (
    <div className={`sc-node sc-node--output${connected ? '' : ' sc-node--frozen'}`}>
      <Handle type="target" position={Position.Left} />
      <div className="sc-node__title">{output.label}</div>
      <div className="sc-node__meta">{sizeLabel(output.size)}</div>
      {!connected && <div className="sc-node__meta">disconnected</div>}
    </div>
  );
}

export const nodeTypes: NodeTypes = { inputNode: InputNodeView, mainNode: MainNodeView, outputNode: OutputNodeView };

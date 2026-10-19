import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import type { InputFlowNode, MainFlowNode, OutputFlowNode } from './flow';

const sizeLabel = (s: { width: number; height: number; unit: string }) => `${s.width} × ${s.height} ${s.unit}`;

function InputNodeView({ data }: NodeProps<InputFlowNode>) {
  const { source } = data;
  return (
    <div className={`sc-node sc-node--input${source.visible ? '' : ' sc-node--hidden'}`}>
      <div className="sc-node__title">{source.label}</div>
      <div className="sc-node__meta">
        {source.kind} · {source.behavesLike}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
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

/**
 * Process node (T12.5, D32): one `layer` in port, one `layer` out port. It shows what it outputs — its input
 * with the chain applied, drawn by the same OutputRenderer — and a one-line summary of its op. The op's
 * settings are in the inspector.
 */
import { deleteProcess, layerAssetSize, type ProcessOp, type RenderScene } from '@smart-canvas/core';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useMemo } from 'react';
import { assetUrl } from '../api';
import { RenderThumbnail } from '../render/OutputRenderer';
import { useBoard } from './context';
import type { ProcessFlowNode } from './flow';
import { Icon } from './LayerRow';

const NO_CANVAS = 'nodrag nopan nowheel';
const pct = (n: number | undefined, base = 1) => `${Math.round((n ?? base) * 100)}%`;

/** "Crop 50% × 100%", "Brightness 120% · Blur 2 px", "Mirror · 90°". */
export function opSummary(op: ProcessOp): string {
  switch (op.type) {
    case 'crop':
      return `Keeps ${pct(op.rect.w)} × ${pct(op.rect.h)}`;
    case 'adjust': {
      const parts = [
        op.opacity !== undefined && op.opacity !== 1 ? `Opacity ${pct(op.opacity)}` : '',
        op.brightness !== undefined && op.brightness !== 1 ? `Brightness ${pct(op.brightness)}` : '',
        op.contrast !== undefined && op.contrast !== 1 ? `Contrast ${pct(op.contrast)}` : '',
        op.saturation !== undefined && op.saturation !== 1 ? `Saturation ${pct(op.saturation)}` : '',
        op.blurPx ? `Blur ${op.blurPx} px` : '',
      ].filter(Boolean);
      return parts.join(' · ') || 'No change yet';
    }
    case 'flip': {
      const parts = [op.x ? 'Mirror' : '', op.y ? 'Flip vertical' : '', op.rotate ? `${op.rotate}°` : ''].filter(Boolean);
      return parts.join(' · ') || 'No change yet';
    }
    case 'textVariant': {
      const parts = [op.text ? `“${op.text.length > 24 ? `${op.text.slice(0, 24)}…` : op.text}”` : '', op.style && Object.keys(op.style).length ? 'restyled' : ''].filter(Boolean);
      return parts.join(' · ') || 'No change yet';
    }
    case 'recolor':
      return `Colour ${op.color}`;
  }
}

export function ProcessNodeView({ data }: NodeProps<ProcessFlowNode>) {
  const { process, layer } = data;
  const { readOnly, run, teamId, layoutDeps } = useBoard();
  const scene = useMemo((): RenderScene | null => {
    if (!layer) return null;
    const size = layoutDeps ? layerAssetSize(layer, layoutDeps.assets) : undefined;
    const w = 200;
    const h = size ? Math.max(20, Math.min(240, (w * size.height) / size.width)) : 150;
    return { width: w, height: h, items: [{ sourceId: layer.id, frame: { x: 0, y: 0, w, h } }] };
  }, [layer, layoutDeps]);

  return (
    <div className="sc-node sc-node--process" aria-label={`Process ${process.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={!readOnly} className="sc-handle--layer" title="Layer in" />
      <div className="sc-node__head">
        <div className="sc-node__title">{process.label}</div>
        {!readOnly && (
          <button
            type="button"
            className={`sc-icon-btn ${NO_CANVAS}`}
            aria-label={`Delete process ${process.label}`}
            title="Delete process"
            onClick={() => window.confirm(`Delete “${process.label}”? Rows it feeds go too.`) && run((d) => deleteProcess(d, process.id))}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="sc-node__meta">{opSummary(process.op)}</div>
      <div className="sc-main-thumb" aria-label={`${process.label} result`}>
        {layer && scene ? (
          <RenderThumbnail scene={scene} sources={[layer]} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={200} maxHeight={150} />
        ) : (
          <span className="sc-muted">Wire an input in</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={!readOnly} className="sc-handle--layer" title="Layer out: wire into a main preview or output row, or another process" />
    </div>
  );
}

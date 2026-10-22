import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { ALLOWED_BEHAVIORS, fillToCss, fontStack, setBehavior, type Behavior, type InputSource } from '@smart-canvas/core';
import { assetUrl } from '../api';
import { AssetEditor, BackgroundSlots, FillEditor, TextEditor, useAssetUpload, type AssetUpload } from './editors';
import { useBoard } from './context';
import { MainNodeView } from './MainNode';
import { SourceHeader } from './SourceHeader';
import type { InputFlowNode } from './flow';
import { OutputNodeView } from './OutputNode';
import { GroupNodeView } from './GroupNode';
import { AssetsNodeView } from './AssetsNode';
import { HeadlineNodeView } from './HeadlineNode';
import { TextNodeView } from './TextNode';
import { PresetNodeView } from './PresetNode';

/**
 * An input on the board: its name and a preview of its content, sized to the card. Everything you can set
 * (name, behaviour, visibility, the content itself, duplicate / library / delete) is in the inspector, so the
 * card doesn't repeat it. Files can still be dropped on the card (T8.3), and an empty picture input has an
 * upload button.
 */
function InputNodeView({ data }: NodeProps<InputFlowNode>) {
  const { source } = data;
  const { readOnly } = useBoard();
  // T8.3: drop an image file anywhere on a picture input (or a photo on a fill background, D9).
  const upload = useAssetUpload(source);
  return (
    <div className={`sc-node sc-node--input${source.visible ? '' : ' sc-node--hidden'}${upload.over ? ' sc-node--drop' : ''}`} {...upload.dropProps}>
      <SourceHeader source={source} />
      {/* D49 (page 3): a Background node is its vertical and horizontal slots; vertical outputs use one, horizontal the other. */}
      {source.behavesLike === 'background' ? <BackgroundSlots source={source} /> : <NodePreview source={source} upload={upload} />}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire into the Layer Comp" />
    </div>
  );
}

const NO_CANVAS = 'nodrag nopan nowheel';

/** The card's view of an input's content (read-only; editing is in the inspector). */
function NodePreview({ source, upload }: { source: InputSource; upload: AssetUpload }) {
  const { teamId, readOnly } = useBoard();
  const { content } = source;
  if (content.kind === 'text')
    return (
      <div className="sc-node__text" lang={content.style.language === 'km' ? 'km' : undefined} style={{ fontFamily: fontStack(content.style.fontFamily), fontWeight: content.style.fontWeight }}>
        {content.text || <span className="sc-muted">No text yet</span>}
      </div>
    );
  const picture = content.kind === 'fill' ? null : content.assetId;
  return (
    <div className="sc-node__preview">
      {content.kind === 'fill' && !picture ? (
        <div className="sc-swatch" style={{ background: fillToCss(content.fill) }} />
      ) : picture ? (
        <img className="sc-thumb" src={assetUrl(teamId, picture)} alt={`${source.label} preview`} draggable={false} />
      ) : readOnly ? (
        <div className="sc-thumb sc-thumb--empty">No {content.kind === 'vector' ? 'SVG' : 'image'} yet</div>
      ) : (
        <label className={`sc-thumb sc-thumb--empty sc-thumb--upload ${NO_CANVAS}`}>
          {upload.busy ? 'Uploading…' : `Upload ${content.kind === 'vector' ? 'an SVG' : 'an image'}… or drop`}
          <input type="file" accept={upload.accept} onChange={upload.onFile} disabled={upload.busy} hidden />
        </label>
      )}
      {upload.busy && picture && <div className="sc-node__busy">Uploading…</div>}
      {upload.error && (
        <p className="sc-error" role="alert">
          {upload.error}
        </p>
      )}
    </div>
  );
}

/** T8.7: how an input adapts in outputs (its behaviour's rules), changeable any time (node and inspector). */
export function BehaviorPicker({ source, id }: { source: InputSource; id?: string }) {
  const { readOnly, run } = useBoard();
  if (readOnly || ALLOWED_BEHAVIORS[source.kind].length < 2) return <>{BEHAVIOR_LABEL[source.behavesLike].toLowerCase()}</>;
  return (
    <select
      id={id}
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
  );
}

const BEHAVIOR_LABEL: Record<Behavior, string> = { background: 'Background', subject: 'Subject', text: 'Text', logo: 'Logo', decoration: 'Decoration' };

export function SourceEditor({ source, upload }: { source: InputSource; upload: AssetUpload }) {
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

export const nodeTypes: NodeTypes = { inputNode: InputNodeView, assetsNode: AssetsNodeView, textNode: TextNodeView, headlineNode: HeadlineNodeView, presetNode: PresetNodeView, mainNode: MainNodeView, outputNode: OutputNodeView, groupNode: GroupNodeView };

/**
 * D44: a Headline card (PDF page 3, "Headline asset Node") — the headline as a Khmer picture and an English
 * picture, each its own layer that keeps its own placement. "Use" picks the one every output draws. Drop or pick a
 * file on a slot (PNG, JPEG, WebP or SVG); click a slot to set that language in the inspector.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { LANGUAGE_LABEL, layersOfPicture, LIMITS, mainComposition, setLanguage, unfitPictures, withComposition, type InputSource, type ProjectDoc } from '@smart-canvas/core';
import { useState, type DragEvent } from 'react';
import { ApiError, assetUrl, uploadAsset } from '../api';
import { setPicture, withSource } from './content';
import { useBoard } from './context';
import type { PairFlowNode } from './flow';

const NO_CANVAS = 'nodrag nopan nowheel';
type Lang = 'km' | 'en';

/**
 * The first picture in a slot starts where the other language sits now (its box, unfitted so the new picture fits
 * into it); a replaced picture fits into its own box (D37), keeping that slot's adjusted transform.
 */
export function pictureIntoSlot(doc: ProjectDoc, s: InputSource, other: InputSource | undefined, assetId: string, kind: 'image' | 'vector'): ProjectDoc {
  const hadPicture = (s.content.kind === 'image' || s.content.kind === 'vector') && !!s.content.assetId;
  let next = withSource(unfitPictures(doc, layersOfPicture(doc, s.id)), s.id, (x) => setPicture(x, assetId, kind));
  const from = other && !hadPicture ? mainComposition(next).placements[other.id] : undefined;
  if (from) {
    const { fitted: _fitted, ...box } = from;
    void _fitted;
    next = withComposition(next, mainComposition(next).id, (c) => ({ ...c, placements: { ...c.placements, [s.id]: box } }));
  }
  return next;
}

export function HeadlineNodeView({ data, selected }: NodeProps<PairFlowNode>) {
  const { pair } = data;
  const { teamId, readOnly, run, rememberAsset, stackFocus, setStackFocus } = useBoard();
  const [busy, setBusy] = useState<Lang | null>(null);
  const [over, setOver] = useState<Lang | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputOf = (lang: Lang) => (lang === 'km' ? data.km : data.en);

  async function upload(lang: Lang, file: File) {
    const s = inputOf(lang);
    if (readOnly || !s) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) return setError(`${file.name}: larger than ${LIMITS.maxUploadMB} MB.`);
    setBusy(lang);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return setError(`${file.name}: use a PNG, JPEG, WebP or SVG file.`);
      rememberAsset(asset);
      const kind = asset.kind;
      run((d) => ({ ok: true, doc: pictureIntoSlot(d, s, inputOf(lang === 'km' ? 'en' : 'km'), asset.id, kind) }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 415 ? `${file.name}: use a PNG, JPEG, WebP or SVG file.` : `${file.name}: upload failed.`);
    } finally {
      setBusy(null);
    }
  }

  const slot = (lang: Lang) => {
    const s = inputOf(lang);
    const asset = s && (s.content.kind === 'image' || s.content.kind === 'vector') ? s.content.assetId : null;
    const focused = selected && s && (stackFocus === s.id || (stackFocus !== data.km?.id && stackFocus !== data.en?.id && lang === pair.use));
    const drop = readOnly
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(lang);
          },
          onDragLeave: () => setOver(null),
          onDrop: (e: DragEvent) => {
            const file = e.dataTransfer.files[0];
            if (!file) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(null);
            void upload(lang, file);
          },
        };
    return (
      <div key={lang} className={`sc-hl-slot${pair.use === lang ? ' sc-hl-slot--use' : ''}${focused ? ' sc-assets__item--focus' : ''}${over === lang ? ' sc-node--drop' : ''}`} {...drop}>
        <span className="sc-hl-slot__title">{LANGUAGE_LABEL[lang]}</span>
        <button type="button" className={`sc-assets__pick ${NO_CANVAS}`} aria-label={`Select ${LANGUAGE_LABEL[lang]} headline`} onClick={() => s && setStackFocus(s.id)}>
          {asset ? <img src={assetUrl(teamId, asset)} alt={`${LANGUAGE_LABEL[lang]} headline`} draggable={false} /> : <span className="sc-muted">{busy === lang ? 'Uploading…' : 'Drag & drop'}</span>}
        </button>
        {!readOnly && (
          <label className={`sc-upload ${NO_CANVAS}`}>
            {asset ? 'Replace…' : 'Add…'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
              aria-label={`${LANGUAGE_LABEL[lang]} headline picture`}
              hidden
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(lang, file);
              }}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="sc-node sc-node--input sc-node--headline">
      <div className="sc-node__head">
        <div className="sc-node__title">{pair.label}</div>
      </div>
      <div className="sc-hl-slots">{(['km', 'en'] as const).map(slot)}</div>
      <div className={`sc-seg sc-hl-use ${NO_CANVAS}`} role="radiogroup" aria-label={`${pair.label} language in use`}>
        <span className="sc-muted">Use</span>
        {(['km', 'en'] as const).map((lang) => (
          <label key={lang}>
            <input type="radio" name={`use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang))} />
            {LANGUAGE_LABEL[lang]}
          </label>
        ))}
      </div>
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
      <Handle type="source" position={Position.Right} isConnectable={!readOnly} className="sc-handle--layer" title="Layers out: wire both languages into a master preview" />
    </div>
  );
}

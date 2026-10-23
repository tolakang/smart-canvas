/**
 * D44: a Headline card (PDF page 3, "Headline asset Node") — the headline as a Khmer picture and an English
 * picture, each its own layer that keeps its own placement. N3: "Add headline" adds another pair (each its own two
 * layers); "Use" picks the language every output draws, for every pair. Drop or pick a
 * file on a slot (PNG, JPEG, WebP, SVG or PDF); click a slot to set that language in the inspector.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { addPairRow, deletePair, deletePairRow, LANGUAGE_LABEL, layersOfPicture, LIMITS, mainComposition, setLanguage, unfitPictures, withComposition, type InputSource, type ProjectDoc } from '@smart-canvas/core';
import { useState, type DragEvent } from 'react';
import { ApiError, assetUrl, uploadAsset } from '../api';
import { setPicture, withSource } from './content';
import { PICTURE_ACCEPT } from './stack-upload';
import { useBoard } from './context';
import type { PairFlowNode } from './flow';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';

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
  const { pair, rows } = data;
  const { teamId, readOnly, run, rememberAsset, stackFocus, setStackFocus } = useBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = new Set(rows.flatMap((r) => [r.km?.id, r.en?.id]));
  /** Row 0 keeps the plain names ("Khmer headline"); later pairs are numbered ("Khmer headline 2"). */
  const nameOf = (i: number, lang: Lang) => `${LANGUAGE_LABEL[lang]} headline${i ? ` ${i + 1}` : ''}`;

  async function upload(i: number, lang: Lang, file: File) {
    const row = rows[i];
    const s = row?.[lang];
    if (readOnly || !row || !s) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) return setError(`${file.name}: larger than ${LIMITS.maxUploadMB} MB.`);
    setBusy(`${i}:${lang}`);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return setError(`${file.name}: use a PNG, JPEG, WebP, SVG or PDF file.`);
      rememberAsset(asset);
      const kind = asset.kind;
      run((d) => ({ ok: true, doc: pictureIntoSlot(d, s, row[lang === 'km' ? 'en' : 'km'], asset.id, kind) }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 415 ? `${file.name}: use a PNG, JPEG, WebP, SVG or PDF file.` : `${file.name}: upload failed.`);
    } finally {
      setBusy(null);
    }
  }

  const slot = (i: number, lang: Lang) => {
    const s = rows[i]?.[lang];
    const key = `${i}:${lang}`;
    const asset = s && (s.content.kind === 'image' || s.content.kind === 'vector') ? s.content.assetId : null;
    const focused = selected && s && (stackFocus === s.id || (!mine.has(stackFocus ?? '') && i === 0 && lang === pair.use));
    const drop = readOnly
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(key);
          },
          onDragLeave: () => setOver(null),
          onDrop: (e: DragEvent) => {
            const file = e.dataTransfer.files[0];
            if (!file) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(null);
            void upload(i, lang, file);
          },
        };
    return (
      <div key={lang} className={`sc-hl-slot${pair.use === lang ? ' sc-hl-slot--use' : ''}${focused ? ' sc-assets__item--focus' : ''}${over === key ? ' sc-node--drop' : ''}`} {...drop}>
        <span className="sc-hl-slot__title">{LANGUAGE_LABEL[lang]}</span>
        <button type="button" className={`sc-assets__pick ${NO_CANVAS}`} aria-label={`Select ${nameOf(i, lang)}`} onClick={() => s && setStackFocus(s.id)}>
          {asset ? <img src={assetUrl(teamId, asset)} alt={nameOf(i, lang)} draggable={false} /> : <span className="sc-muted">{busy === key ? 'Uploading…' : 'Drag & drop'}</span>}
        </button>
        {!readOnly && (
          <label className={`sc-upload ${NO_CANVAS}`}>
            {asset ? 'Replace…' : 'Add…'}
            <input
              type="file"
              accept={PICTURE_ACCEPT}
              aria-label={`${nameOf(i, lang)} picture`}
              hidden
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(i, lang, file);
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
        {rows.length > 1 && (
          <span className="sc-count" aria-label={`${rows.length} headlines`}>
            {rows.length}
          </span>
        )}
        {!readOnly && (
          <button type="button" className={`sc-icon-btn ${NO_CANVAS}`} aria-label={`Delete ${pair.label}`} title="Delete this node and all its pictures" onClick={() => confirmDelete(pair.label) && run((d) => deletePair(d, pair.id))}>
            <Icon name="trash" />
          </button>
        )}
      </div>
      {rows.map((_, i) => (
        <div key={i} className="sc-hl-row" role="group" aria-label={`Headline ${i + 1}`}>
          {rows.length > 1 && (
            <div className="sc-hl-row__head">
              <span className="sc-muted">Headline {i + 1}</span>
              {!readOnly && (
                <button
                  type="button"
                  className={`sc-icon-btn ${NO_CANVAS}`}
                  aria-label={`Delete headline ${i + 1}`}
                  title="Delete this Khmer / English pair"
                  onClick={() => window.confirm(`Delete headline ${i + 1} (both languages)?`) && run((d) => deletePairRow(d, pair.id, i))}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
          )}
          <div className="sc-hl-slots">{(['km', 'en'] as const).map((lang) => slot(i, lang))}</div>
        </div>
      ))}
      {!readOnly && (
        <button type="button" className={`sc-btn sc-hl-add ${NO_CANVAS}`} onClick={() => run((d) => addPairRow(d, pair.id, { km: newId(), en: newId() }))}>
          <Icon name="plus" /> Add headline
        </button>
      )}
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
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every headline into the Layer Comp" />
    </div>
  );
}

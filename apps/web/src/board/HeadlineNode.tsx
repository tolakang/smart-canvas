/**
 * D44: a Headline card (PDF page 3, "Headline asset Node") — the headline as a Khmer picture and an English
 * picture, each its own layer that keeps its own placement. N3: "Add headline" adds another pair (each its own two
 * layers); "Use" picks the language every output draws, for every pair. Drop or pick a
 * file on a slot (PNG, JPEG, WebP, SVG or PDF); click a slot to set that language in the inspector.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { addPairRow, deletePair, deletePairRow, LANGUAGE_LABEL, LIMITS, mainComposition, setLanguage, unfitPictures, withComposition, type InputSource, type ProjectDoc } from '@smart-canvas/core';
import { useState } from 'react';
import { ApiError, assetUrl, UploadCancelled, uploadAsset } from '../api';
import { setAsset, setPicture, withSource } from './content';
import { PICTURE_ACCEPT } from './stack-upload';
import { useBoard } from './context';
import type { PairFlowNode } from './flow';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { Slot } from './Slot';

const NO_CANVAS = 'nodrag nopan nowheel';
type Lang = 'km' | 'en';

/**
 * The first picture in a slot starts where the other language sits now (its box, unfitted so the new picture fits
 * into it); a replaced picture fits into its own box (D37), keeping that slot's adjusted transform.
 */
export function pictureIntoSlot(doc: ProjectDoc, s: InputSource, other: InputSource | undefined, assetId: string, kind: 'image' | 'vector'): ProjectDoc {
  const hadPicture = (s.content.kind === 'image' || s.content.kind === 'vector') && !!s.content.assetId;
  let next = withSource(unfitPictures(doc, new Set([s.id])), s.id, (x) => setPicture(x, assetId, kind));
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
      if (err instanceof UploadCancelled) return;
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
    return (
      <Slot
        key={lang}
        shape="wide"
        className={pair.use === lang ? 'sc-slot--in-use' : undefined}
        caption={
          <>
            {LANGUAGE_LABEL[lang]}
            {pair.use === lang && <span className="sc-slot__tag">In use</span>}
          </>
        }
        src={asset ? assetUrl(teamId, asset) : null}
        alt={nameOf(i, lang)}
        busy={busy === key}
        focused={Boolean(focused)}
        readOnly={readOnly}
        accept={PICTURE_ACCEPT}
        emptyText="Add picture"
        names={{ select: `Select ${nameOf(i, lang)}`, file: `${nameOf(i, lang)} picture`, remove: `Remove picture from ${nameOf(i, lang)}` }}
        onSelect={() => s && setStackFocus(s.id)}
        onFile={(file) => void upload(i, lang, file)}
        onRemovePicture={s ? () => run((d) => ({ ok: true, doc: withSource(d, s.id, (x) => setAsset(x, null)) })) : undefined}
      />
    );
  };

  return (
    <div className="sc-node sc-node--input sc-node--headline">
      <NodeHead
        icon="font"
        title={pair.label}
        sub={`${rows.length} ${rows.length === 1 ? 'headline' : 'headlines'} · ${LANGUAGE_LABEL[pair.use]} in use`}
        menuLabel={`${pair.label} actions`}
        menu={readOnly ? [] : [{ label: `Delete ${pair.label}`, danger: true, onSelect: () => confirmDelete(pair.label) && run((d) => deletePair(d, pair.id)) }]}
      />
      {rows.map((_, i) => (
        <div key={i} className="sc-hl-row" role="group" aria-label={`Headline ${i + 1}`}>
          {rows.length > 1 && (
            <div className="sc-hl-row__head">
              <span>Headline {i + 1}</span>
              {!readOnly && (
                <button
                  type="button"
                  className={`sc-icon-btn sc-hl-row__delete ${NO_CANVAS}`}
                  aria-label={`Delete headline ${i + 1}`}
                  title="Delete this Khmer / English pair"
                  onClick={() => window.confirm(`Delete headline ${i + 1} (both languages)?`) && run((d) => deletePairRow(d, pair.id, i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )}
          <div className="sc-hl-slots">{(['km', 'en'] as const).map((lang) => slot(i, lang))}</div>
        </div>
      ))}
      <div className={`sc-hl-foot ${NO_CANVAS}`}>
        <div className="sc-switch" role="radiogroup" aria-label={`${pair.label} language in use`}>
          {(['km', 'en'] as const).map((lang) => (
            <label key={lang} className={pair.use === lang ? 'sc-switch__on' : undefined}>
              <input type="radio" name={`use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang))} />
              {LANGUAGE_LABEL[lang]}
            </label>
          ))}
        </div>
        {!readOnly && (
          <button type="button" className="sc-btn sc-btn--soft sc-hl-add" onClick={() => run((d) => addPairRow(d, pair.id, { km: newId(), en: newId() }))}>
            <Icon name="plus" size={14} /> Add headline
          </button>
        )}
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

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
import { cardClass } from './card';
import { useBoard } from './context';
import type { PairFlowNode } from './flow';
import { newId } from './ids';
import { confirmDelete, Icon } from './LayerRow';
import { NodeHead } from './NodeHead';
import { Slot } from './Slot';
import { NO_CANVAS } from './pinch';

type Lang = 'km' | 'en';

/** The switch for the language in use: two segments, the one in use filled with the accent. */
const SWITCH = 'sc-switch inline-flex gap-2 rounded-[11px] bg-surface-2 p-3';
const SEGMENT =
  'relative inline-flex cursor-pointer items-center rounded-[8px] px-12 py-6 text-[12.5px] font-[600] [transition:background_var(--t-fast),color_var(--t-fast),box-shadow_var(--t-fast)] has-[input:focus-visible]:[outline:2px_solid_var(--accent)] has-[input:focus-visible]:outline-offset-1 pointer-coarse:px-16 pointer-coarse:py-10';
const SEGMENT_ON = `sc-switch__on ${SEGMENT} bg-accent text-on-accent [box-shadow:0_2px_6px_-2px_color-mix(in_srgb,var(--accent)_60%,transparent)]`;
const SEGMENT_OFF = `${SEGMENT} text-muted`;

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
  const { teamId, readOnly, run, rememberAsset, stackFocus, setStackFocus, layoutDeps } = useBoard();
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
        // V4 (owner: no "In use" word — highlight the active one): the language in use stands out, the other steps back.
        use={pair.use === lang ? 'in-use' : 'off'}
        caption={LANGUAGE_LABEL[lang]}
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
    <div className={`${cardClass('input')} sc-node--headline`}>
      <NodeHead
        icon="font"
        title={pair.label}
        sub={`${rows.length} ${rows.length === 1 ? 'headline' : 'headlines'} · ${LANGUAGE_LABEL[pair.use]}`}
        menuLabel={`${pair.label} actions`}
        menu={readOnly ? [] : [{ label: `Delete ${pair.label}`, danger: true, onSelect: () => confirmDelete(pair.label) && run((d) => deletePair(d, pair.id)) }]}
      />
      {rows.map((_, i) => (
        <div
          key={i}
          className={`sc-hl-row group/hl grid gap-10 ${i ? ' mt-4 pt-14 [border-top:1px_solid_color-mix(in_srgb,var(--line)_80%,transparent)]' : ''}`}
          role="group" aria-label={`Headline ${i + 1}`}>
          {rows.length > 1 && (
            <div className="sc-hl-row__head m-0 flex items-center justify-between text-[12px] font-[650] text-fg">
              <span>Headline {i + 1}</span>
              {!readOnly && (
                <button
                  type="button"
                  className={`sc-icon-btn sc-hl-row__delete opacity-0 [transition:opacity_var(--t-fast)] group-hover/hl:opacity-100 group-focus-within/hl:opacity-100 [@media(hover:none)]:opacity-100 ${NO_CANVAS}`}
                  aria-label={`Delete headline ${i + 1}`}
                  title="Delete this Khmer / English pair"
                  onClick={() => window.confirm(`Delete headline ${i + 1} (both languages)?`) && run((d) => deletePairRow(d, pair.id, i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )}
          <div className="sc-hl-slots grid grid-cols-[1fr_1fr] gap-12">{(['km', 'en'] as const).map((lang) => slot(i, lang))}</div>
        </div>
      ))}
      <div className={`sc-hl-foot flex flex-wrap items-center justify-between gap-10 ${NO_CANVAS}`}>
        <div className={SWITCH} role="radiogroup" aria-label={`${pair.label} language in use`}>
          {(['km', 'en'] as const).map((lang) => (
            <label key={lang} className={pair.use === lang ? SEGMENT_ON : SEGMENT_OFF}>
              <input
                className="absolute inset-0 m-0 cursor-pointer opacity-0"
                type="radio" name={`use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang, layoutDeps?.assets))} />
              {LANGUAGE_LABEL[lang]}
            </label>
          ))}
        </div>
        {!readOnly && (
          <button type="button" className="sc-btn sc-btn--soft sc-hl-add flex w-auto gap-6" onClick={() => run((d) => addPairRow(d, pair.id, { km: newId(), en: newId() }))}>
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

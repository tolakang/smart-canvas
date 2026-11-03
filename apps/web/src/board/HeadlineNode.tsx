/**
 * D44 / D78: the Language node (named Headline card before D78) — picture assets, each in Khmer, English and Chinese.
 * Each row is one asset (a headline, an offer badge…), each language its own layer sharing one layout (V4); the switch
 * at the top picks the language every output draws, for every row. The slot headings (KH · EN · CN) show once, the
 * language in use lit; a row's name is double-clicked to rename it and its bin deletes it. Drop or pick a file on a
 * slot (PNG, JPEG, WebP, SVG or PDF); click a slot to set that picture in the inspector.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { addLanguageInput, addPairRow, deletePair, deletePairRow, LANGUAGE_LABEL, LANGUAGE_SHORT, LANGUAGES, LIMITS, mainComposition, renameLanguageRow, rowName, setLanguage, unfitPictures, withComposition, type InputSource, type LanguageCode, type ProjectDoc } from '@smart-canvas/core';
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
import { ADD_BUTTON, iconBtn } from '../ui/button';
import { SEGMENT_OFF, SEGMENT_ON } from '../ui/controls';
import { ERROR_TEXT } from '../ui/tw';

/** Three language slots and the row's bin. */
const COLS = 'grid grid-cols-[repeat(3,minmax(0,1fr))_28px] items-center gap-8 pointer-coarse:grid-cols-[repeat(3,minmax(0,1fr))_44px]';

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
  const { doc, teamId, readOnly, run, rememberAsset, stackFocus, setStackFocus, layoutDeps } = useBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ i: number; draft: string } | null>(null);
  const mine = new Set(rows.flatMap((r) => [r.km?.id, r.en?.id, r.zh?.id]));
  const names = rows.map((r) => (r.km ? rowName(doc, { km: r.km.id, en: r.en?.id ?? '' }) : ''));
  const nameOf = (i: number, lang: LanguageCode) => `${LANGUAGE_LABEL[lang]} ${names[i] || `asset ${i + 1}`}`;

  async function upload(i: number, lang: LanguageCode, file: File) {
    const row = rows[i];
    if (readOnly || !row?.km) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) return setError(`${file.name}: larger than ${LIMITS.maxUploadMB} MB.`);
    setBusy(`${i}:${lang}`);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return setError(`${file.name}: use a PNG, JPEG, WebP, SVG or PDF file.`);
      rememberAsset(asset);
      const kind = asset.kind;
      run((d) => {
        // D78: an older row has no Chinese input yet: the first picture makes it.
        let next = d;
        let s = row[lang];
        if (!s) {
          const id = newId();
          const made = addLanguageInput(d, pair.id, i, lang, id);
          if (!made.ok) return made;
          next = made.doc;
          s = next.sources.find((x) => x.id === id);
          if (!s) return { ok: false, error: 'not_found' };
        }
        const other = LANGUAGES.map((l) => row[l]).find((x) => x && x.id !== s?.id && (x.content.kind === 'image' || x.content.kind === 'vector') && x.content.assetId) ?? row.km;
        return { ok: true, doc: pictureIntoSlot(next, s, other, asset.id, kind) };
      });
    } catch (err) {
      if (err instanceof UploadCancelled) return;
      setError(err instanceof ApiError && err.status === 415 ? `${file.name}: use a PNG, JPEG, WebP, SVG or PDF file.` : `${file.name}: upload failed.`);
    } finally {
      setBusy(null);
    }
  }

  const slot = (i: number, lang: LanguageCode) => {
    const s = rows[i]?.[lang];
    const key = `${i}:${lang}`;
    const asset = s && (s.content.kind === 'image' || s.content.kind === 'vector') ? s.content.assetId : null;
    const focused = selected && s && (stackFocus === s.id || (!mine.has(stackFocus ?? '') && i === 0 && lang === pair.use));
    return (
      <Slot
        key={lang}
        bare
        // V4: the language in use stands out, the others step back.
        use={pair.use === lang ? 'in-use' : 'off'}
        tileClass="aspect-[4/3]"
        src={asset ? assetUrl(teamId, asset) : null}
        alt={nameOf(i, lang)}
        busy={busy === key}
        focused={Boolean(focused)}
        readOnly={readOnly}
        accept={PICTURE_ACCEPT}
        emptyText={`Add the ${LANGUAGE_LABEL[lang]} picture`}
        names={{ select: `Select ${nameOf(i, lang)}`, file: `${nameOf(i, lang)} picture`, remove: `Remove picture from ${nameOf(i, lang)}` }}
        onSelect={() => s && setStackFocus(s.id)}
        onFile={(file) => void upload(i, lang, file)}
        onRemovePicture={s ? () => run((d) => ({ ok: true, doc: withSource(d, s.id, (x) => setAsset(x, null)) })) : undefined}
      />
    );
  };
  const commitName = () => {
    if (renaming) run((d) => renameLanguageRow(d, pair.id, renaming.i, renaming.draft));
    setRenaming(null);
  };

  return (
    <div className={`${cardClass('input', { wide: true })} sc-node--headline`}>
      <NodeHead
        icon="font"
        title={pair.label}
        sub={`${rows.length} ${rows.length === 1 ? 'asset' : 'assets'} · ${LANGUAGE_LABEL[pair.use]}`}
        menuLabel={`${pair.label} actions`}
        menu={readOnly ? [] : [{ label: `Delete ${pair.label}`, icon: 'trash' as const, danger: true, onSelect: () => confirmDelete(pair.label) && run((d) => deletePair(d, pair.id)) }]}
      />
      {/* Owner, 2026-11-03: the languages to switch between come first; each heads its column of slots. */}
      <div className={`sc-lang-switch ${COLS} rounded-[11px] bg-surface-2 px-6 py-3 ${NO_CANVAS}`} role="radiogroup" aria-label={`${pair.label} language in use`}>
        {LANGUAGES.map((lang) => (
          <label key={lang} className={`${pair.use === lang ? SEGMENT_ON : SEGMENT_OFF} justify-center px-0!`} title={`${LANGUAGE_LABEL[lang]}${pair.use === lang ? ' (in use)' : ''}`}>
            <input
              className="absolute inset-0 m-0 cursor-pointer opacity-0"
              type="radio"
              name={`use-${pair.id}`}
              aria-label={LANGUAGE_LABEL[lang]}
              checked={pair.use === lang}
              disabled={readOnly}
              onChange={() => run((d) => setLanguage(d, pair.id, lang, layoutDeps?.assets))}
            />
            {LANGUAGE_SHORT[lang]}
          </label>
        ))}
      </div>
      <ul className={`sc-lang-rows m-0 grid list-none gap-10 p-0 ${NO_CANVAS}`} aria-label={`${pair.label} assets`}>
        {rows.map((_, i) => (
          <li key={i} className="sc-hl-row group/hl grid gap-6" role="group" aria-label={names[i] || `Asset ${i + 1}`}>
            {renaming?.i === i ? (
              <input
                className="sc-rename mx-6 text-[12.5px]"
                aria-label="Asset name"
                value={renaming.draft}
                autoFocus
                maxLength={200}
                onChange={(e) => setRenaming({ i, draft: e.target.value })}
                onBlur={commitName}
                onKeyDown={(e) => (e.key === 'Enter' ? commitName() : e.key === 'Escape' && setRenaming(null))}
              />
            ) : (
              <span
                className="sc-hl-row__name overflow-hidden px-6 text-[12.5px] font-[650] text-ellipsis whitespace-nowrap"
                title={readOnly ? names[i] : `${names[i]} — double-click to rename`}
                onDoubleClick={() => !readOnly && setRenaming({ i, draft: names[i] ?? '' })}
              >
                {names[i] || `Asset ${i + 1}`}
              </span>
            )}
            <div className={`${COLS} px-6`}>
              {LANGUAGES.map((lang) => slot(i, lang))}
              {!readOnly ? (
                <button
                  type="button"
                  className={`${iconBtn({ size: 'size-28', round: 'rounded-[8px]', transition: '[transition:opacity_var(--t-fast)]' })} sc-hl-row__delete opacity-0 group-hover/hl:opacity-100 group-focus-within/hl:opacity-100 [@media(hover:none)]:opacity-100`}
                  aria-label={`Delete ${names[i] || `asset ${i + 1}`}`}
                  title="Delete this asset (every language)"
                  onClick={() => window.confirm(`Delete “${names[i] || `asset ${i + 1}`}” (every language)?`) && run((d) => deletePairRow(d, pair.id, i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              ) : (
                <span />
              )}
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <button type="button" className={`${ADD_BUTTON} sc-hl-add ${NO_CANVAS}`} onClick={() => run((d) => addPairRow(d, pair.id, { km: newId(), en: newId(), zh: newId() }))}>
          <Icon name="plus" size={14} /> Add asset
        </button>
      )}
      {error && (
        <p className={ERROR_TEXT} role="alert">
          {error}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" title="Wire every asset into Main Comps" />
    </div>
  );
}

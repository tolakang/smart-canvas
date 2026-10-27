import { fillToCss, fontStack, LIMITS, unfitPictures, type Fill, type InputSource } from '@smart-canvas/core';
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { ApiError, assetUrl, UploadCancelled, uploadAsset } from '../api';
import { addStop, colourBackground, photoBackground, removeStop, setAsset, setFill, setStop, setText, setVariant, switchFillType, withSource } from './content';
import { useBoard } from './context';
import { Slot } from './Slot';

// Interactive elements inside a node must not start a node drag, pan or zoom.
const NO_CANVAS = 'nodrag nopan nowheel';

const ACCEPT: Record<'image' | 'vector', string> = {
  image: 'image/png,image/jpeg,image/webp,application/pdf,.pdf',
  vector: 'image/svg+xml,.svg,application/pdf,.pdf',
};

function uploadMessage(err: unknown, kind: 'image' | 'vector'): string {
  if (!(err instanceof ApiError)) return 'Upload failed. Check your connection and try again.';
  const body = err.body as { error?: string; reason?: string } | null;
  if (err.status === 413) return `File is larger than ${LIMITS.maxUploadMB} MB.`;
  if (err.status === 415) return kind === 'image' ? 'Use a PNG, JPEG, WebP or PDF file.' : 'Use an SVG or PDF file.';
  if (body?.error === 'svg_rejected') return `This SVG can't be used (${body.reason ?? 'invalid'}).`;
  if (err.status === 403) return 'You can only view this project.';
  return 'Upload failed. Try again.';
}

/** What kind of file an input takes: its own kind, or a photo for a fill background (D9); null = none. */
export function fileKindOf(source: InputSource): 'image' | 'vector' | null {
  if (source.content.kind === 'image' || source.content.kind === 'vector') return source.content.kind;
  if (source.content.kind === 'fill' && source.behavesLike === 'background') return 'image';
  return null;
}

/**
 * Upload a file into an input (T8.3: the same path for the file picker and for a file dropped on the node):
 * size cap, upload (the API validates the bytes), kind check, then the input's content.
 */
export function useAssetUpload(source: InputSource) {
  const { teamId, readOnly, run, rememberAsset } = useBoard();
  const kind = fileKindOf(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!kind || readOnly) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) {
      setError(`File is larger than ${LIMITS.maxUploadMB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const asset = await uploadAsset(teamId, file, { pdf: kind === 'vector' ? 'vector' : 'image' });
      if (asset.kind !== kind) setError(kind === 'image' ? 'This input takes PNG, JPEG, WebP or PDF.' : 'This input takes SVG or PDF files.');
      else {
        rememberAsset(asset);
        // D37: the old picture's frames stop hugging it; once the new one is measured, it's fitted into them.
        run((d) => ({
          ok: true,
          doc: withSource(unfitPictures(d, new Set([source.id])), source.id, (s) => (s.content.kind === 'fill' ? photoBackground(s, asset.id) : setAsset(s, asset.id))),
        }));
      }
    } catch (err) {
      if (!(err instanceof UploadCancelled)) setError(uploadMessage(err, kind));
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (file) void upload(file);
  }

  // Drag & drop of files from the desktop onto the node.
  const [over, setOver] = useState(false);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const dropProps =
    kind && !readOnly
      ? {
          onDragOver: (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            setOver(true);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          },
          onDrop: (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          },
        }
      : {};

  return { kind, busy, error, onFile, over, dropProps, accept: kind ? ACCEPT[kind] : '' };
}

export type AssetUpload = ReturnType<typeof useAssetUpload>;

export function AssetEditor({ source, upload }: { source: InputSource & { content: { kind: 'image' | 'vector' } }; upload: AssetUpload }) {
  const { teamId, readOnly, editSource } = useBoard();
  const kind = source.content.kind;
  const { busy, error, onFile } = upload;

  const { assetId } = source.content;
  return (
    <div className="sc-editor">
      {assetId ? (
        <img className="sc-thumb" src={assetUrl(teamId, assetId)} alt={`${source.label} preview`} draggable={false} />
      ) : (
        <div className="sc-thumb sc-thumb--empty">No {kind === 'image' ? 'image' : 'SVG'} yet</div>
      )}
      {!readOnly && (
        <label className={`sc-upload ${NO_CANVAS}`}>
          {busy ? 'Uploading…' : assetId ? 'Replace… or drop' : 'Upload… or drop'}
          <input type="file" accept={ACCEPT[kind]} onChange={onFile} disabled={busy} hidden />
        </label>
      )}
      {!readOnly && kind === 'image' && source.behavesLike === 'background' && (
        <button type="button" className={`sc-link ${NO_CANVAS}`} onClick={() => editSource(source.id, colourBackground)}>
          Use a colour instead
        </button>
      )}
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextEditor({ source }: { source: InputSource & { content: { kind: 'text' } } }) {
  const { readOnly, editSource } = useBoard();
  return (
    <textarea
      className={`sc-text ${NO_CANVAS}`}
      aria-label={`${source.label} text`}
      value={source.content.text}
      readOnly={readOnly}
      rows={3}
      lang={source.content.style.language === 'km' ? 'km' : undefined}
      style={{ fontFamily: fontStack(source.content.style.fontFamily), fontWeight: source.content.style.fontWeight }}
      onChange={(e) => editSource(source.id, (s) => setText(s, e.target.value))}
    />
  );
}

export function FillEditor({ source, upload }: { source: InputSource & { content: { kind: 'fill' } }; upload: AssetUpload }) {
  const { readOnly, editSource } = useBoard();
  const { fill } = source.content;
  const change = (next: Fill) => editSource(source.id, (s) => setFill(s, next));

  return (
    <div className="sc-editor">
      <div className="sc-swatch" style={{ background: fillToCss(fill) }} />
      <fieldset className={`sc-fill ${NO_CANVAS}`} disabled={readOnly}>
        <div className="sc-seg" role="radiogroup" aria-label="Fill type">
          {(['solid', 'linear'] as const).map((t) => (
            <label key={t}>
              <input type="radio" name={`fill-${source.id}`} checked={fill.type === t} onChange={() => change(switchFillType(fill, t))} />
              {t === 'solid' ? 'Solid' : 'Gradient'}
            </label>
          ))}
        </div>
        {fill.type === 'solid' ? (
          <label className="sc-field">
            Colour
            <input type="color" value={fill.color} onChange={(e) => change({ type: 'solid', color: e.target.value })} />
          </label>
        ) : (
          <>
            <label className="sc-field">
              Angle
              <input
                type="number"
                min={0}
                max={360}
                step={15}
                value={fill.angleDeg}
                onChange={(e) => change({ ...fill, angleDeg: Number(e.target.value) || 0 })}
              />
              °
            </label>
            {fill.stops.map((stop, i) => (
              <div className="sc-field" key={i}>
                <input
                  type="color"
                  aria-label={`Stop ${i + 1} colour`}
                  value={stop.color}
                  onChange={(e) => change(setStop(fill, i, { color: e.target.value }))}
                />
                <input
                  type="number"
                  aria-label={`Stop ${i + 1} position`}
                  min={0}
                  max={100}
                  value={Math.round(stop.offset * 100)}
                  onChange={(e) => change(setStop(fill, i, { offset: Number(e.target.value) / 100 }))}
                />
                %
                {fill.stops.length > 2 && (
                  <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => change(removeStop(fill, i))}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => change(addStop(fill))}>
              + Stop
            </button>
          </>
        )}
      </fieldset>
      {!readOnly && upload.kind && (
        <label className={`sc-upload ${NO_CANVAS}`} title="A background can be a photo (D9)">
          {upload.busy ? 'Uploading…' : 'Use a photo… or drop'}
          <input type="file" accept={upload.accept} onChange={upload.onFile} disabled={upload.busy} hidden />
        </label>
      )}
      {upload.error && (
        <p className="sc-error" role="alert">
          {upload.error}
        </p>
      )}
    </div>
  );
}

/**
 * D43: a background's three slots — Square (its main picture, also used by any output whose slot is empty),
 * Vertical and Horizontal. Each output uses the slot of its group (the one it was moved to, else its shape's).
 * Pick or drop a file on a slot; × clears it.
 */
type BgSlot = 'square' | 'vertical' | 'horizontal';
/** In reading order: Horizontal across the top, then Square and Vertical (owner sketch). */
const BG_SLOTS: readonly BgSlot[] = ['horizontal', 'square', 'vertical'];
/** Horizontal across the top, Square and Vertical side by side below (owner sketch 2026-10-25), each tile in its own shape. */
const BG_PLACE: Record<BgSlot, string> = { horizontal: '[grid-area:h]', square: '[grid-area:s]', vertical: '[grid-area:v]' };
const BG_TILE: Record<BgSlot, string> = { horizontal: 'h-auto aspect-[7/4]', square: 'h-auto aspect-square', vertical: 'h-auto aspect-[5/8]' };
const BG_LABEL: Record<BgSlot, string> = { square: 'Square', vertical: 'Vertical', horizontal: 'Horizontal' };

export function BackgroundSlots({ source, selected = true }: { source: InputSource; /** On the board: the node is selected (a tapped slot keeps its actions shown, as on the Headline node). */ selected?: boolean }) {
  const { teamId, readOnly, run, rememberAsset } = useBoard();
  const [busy, setBusy] = useState<BgSlot | null>(null);
  const [focus, setFocus] = useState<BgSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = source.content;
  const picture = (slot: BgSlot) => (c.kind === 'image' || c.kind === 'vector' ? (slot === 'square' ? c.assetId : c.variants?.[slot]) : null);
  const put = (slot: BgSlot, id: string | null) => (s: InputSource) =>
    slot !== 'square' ? setVariant(s, slot, id) : id && s.content.kind === 'fill' ? photoBackground(s, id) : setAsset(s, id);

  async function upload(family: BgSlot, file: File) {
    if (readOnly) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) return setError(`File is larger than ${LIMITS.maxUploadMB} MB.`);
    setBusy(family);
    try {
      const asset = await uploadAsset(teamId, file, { pdf: 'image' });
      if (asset.kind !== 'image') setError('Use a PNG, JPEG, WebP or PDF file.');
      else {
        rememberAsset(asset);
        run((d) => ({ ok: true, doc: withSource(d, source.id, put(family, asset.id)) }));
      }
    } catch (err) {
      if (!(err instanceof UploadCancelled)) setError(uploadMessage(err, 'image'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sc-bg-slots grid grid-cols-[repeat(2,minmax(0,1fr))] items-start gap-12 [grid-template-areas:'h_h'_'s_v'] [&>.sc-error]:col-[1/-1]" aria-label="Background for square, vertical and horizontal Previews">
      {BG_SLOTS.map((family) => {
        const id = picture(family);
        const label = BG_LABEL[family];
        return (
          <Slot
            key={family}
            shape="wide"
            className={`sc-bg-slot--${family} ${BG_PLACE[family]}`}
            tileClass={BG_TILE[family]}
            caption={label}
            src={id ? assetUrl(teamId, id) : null}
            alt={`${label} background`}
            busy={busy === family}
            focused={selected && focus === family}
            readOnly={readOnly}
            accept={ACCEPT.image}
            onSelect={() => setFocus(family)}
            emptyText={family === 'square' ? 'Add picture' : 'Same as square'}
            names={{ select: `${label} background`, file: `${label} background picture`, remove: `Clear ${label.toLowerCase()} background` }}
            onFile={(file) => void upload(family, file)}
            onRemovePicture={() => run((d) => ({ ok: true, doc: withSource(d, source.id, put(family, null)) }))}
          />
        );
      })}
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

import { fontStack, LIMITS, type Fill, type InputSource } from '@smart-canvas/core';
import { useState, type ChangeEvent } from 'react';
import { ApiError, assetUrl, uploadAsset } from '../api';
import { addStop, fillToCss, removeStop, setAsset, setFill, setStop, setText, switchFillType } from './content';
import { useBoard } from './context';

// Interactive elements inside a node must not start a node drag, pan or zoom.
const NO_CANVAS = 'nodrag nopan nowheel';

const ACCEPT: Record<'image' | 'vector', string> = {
  image: 'image/png,image/jpeg,image/webp',
  vector: 'image/svg+xml,.svg',
};

function uploadMessage(err: unknown, kind: 'image' | 'vector'): string {
  if (!(err instanceof ApiError)) return 'Upload failed. Check your connection and try again.';
  const body = err.body as { error?: string; reason?: string } | null;
  if (err.status === 413) return `File is larger than ${LIMITS.maxUploadMB} MB.`;
  if (err.status === 415) return kind === 'image' ? 'Use a PNG, JPEG or WebP image.' : 'Use an SVG file.';
  if (body?.error === 'svg_rejected') return `This SVG can't be used (${body.reason ?? 'invalid'}).`;
  if (err.status === 403) return 'You can only view this project.';
  return 'Upload failed. Try again.';
}

export function AssetEditor({ source }: { source: InputSource & { content: { kind: 'image' | 'vector' } } }) {
  const { teamId, readOnly, editSource } = useBoard();
  const kind = source.content.kind;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setError(null);
    if (file.size > LIMITS.maxUploadMB * 1024 * 1024) {
      setError(`File is larger than ${LIMITS.maxUploadMB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== kind) setError(kind === 'image' ? 'This input takes PNG, JPEG or WebP.' : 'This input takes SVG files.');
      else editSource(source.id, (s) => setAsset(s, asset.id));
    } catch (err) {
      setError(uploadMessage(err, kind));
    } finally {
      setBusy(false);
    }
  }

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
          {busy ? 'Uploading…' : assetId ? 'Replace…' : 'Upload…'}
          <input type="file" accept={ACCEPT[kind]} onChange={onFile} disabled={busy} hidden />
        </label>
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

export function FillEditor({ source }: { source: InputSource & { content: { kind: 'fill' } } }) {
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
    </div>
  );
}

import { BUNDLED_FONTS, fontStack, LIMITS } from '@smart-canvas/core';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, uploadAsset } from '../api';
import type { TeamFont } from './loader';
import { DIALOG } from '../ui/tw';
import { FILE_PICK } from '../ui/file-pick';

const SAMPLE = 'Aa Bb 123 · សួស្តី កម្ពុជា';

function uploadMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Upload failed. Check your connection and try again.';
  if (err.status === 413) return `File is larger than ${LIMITS.maxUploadMB} MB.`;
  if (err.status === 415) return 'Use a TTF, OTF or WOFF2 font (font collections are not supported).';
  if (err.status === 422) return 'This file could not be read as a font.';
  if (err.status === 403) return 'You can only view fonts.';
  return 'Upload failed. Try again.';
}

/** Lists bundled and team fonts in their own face; editors can upload TTF/OTF/WOFF2. */
export function FontsDialog(props: {
  teamId: string;
  readOnly: boolean;
  teamFonts: TeamFont[];
  onUploaded: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setAdded(null);
    setBusy(true);
    try {
      const asset = await uploadAsset(props.teamId, file);
      if (asset.kind !== 'font') setError('That file is not a font.');
      else {
        setAdded(asset.fontFamily);
        props.onUploaded();
      }
    } catch (err) {
      setError(uploadMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const row = (family: string, note: string) => (
    <li key={`${note}:${family}`} className="rounded-[12px] border border-line bg-surface-2 px-14 py-12">
      <div className="sc-font__name text-[12px] font-[600]">
        {family} <span className="sc-muted">{note}</span>
      </div>
      <div className="sc-font__sample text-[22px] leading-[1.3]" style={{ fontFamily: fontStack(family) }}>
        {SAMPLE}
      </div>
    </li>
  );

  return (
    <dialog ref={ref} className={DIALOG} onClose={props.onClose} aria-labelledby="fonts-title">
      <div className="sc-card sc-card--wide">
        <h1 id="fonts-title">Fonts</h1>
        <ul className="sc-fonts m-0 grid max-h-[50vh] list-none gap-8 overflow-auto p-0" aria-label="Available fonts">
          {BUNDLED_FONTS.map((f) => row(f.family, 'bundled'))}
          {props.teamFonts.map((f) => row(f.family, 'team'))}
        </ul>
        {!props.readOnly && (
          <label className="sc-upload" {...FILE_PICK}>
            {busy ? 'Uploading…' : 'Upload font (TTF, OTF, WOFF2)…'}
            <input type="file" accept=".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2" onChange={onFile} disabled={busy} hidden />
          </label>
        )}
        {added && <p role="status">Added “{added}”.</p>}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <div className="sc-row">
          <button type="button" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * D40: many files at once into an Assets card (or a new card where they were dropped on the canvas). Every file
 * is uploaded (the API checks the bytes); pictures (PNG, JPEG, WebP, SVG; a PDF as its first page, N2) become the card's items in one undo
 * step; the rest are listed as errors.
 */
import { addPicturesToStack, addStack, LIMITS, type ProjectDoc, type SourceResult, type StackPicture } from '@smart-canvas/core';
import { useState } from 'react';
import { ApiError, UploadCancelled, uploadAsset, type AssetMeta } from '../api';
import { useBoard } from './context';
import { newId } from './ids';

export const PICTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg,application/pdf,.pdf';

const labelOf = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Picture';

function reason(file: File, err: unknown): string {
  if (err instanceof ApiError && err.status === 415) return `${file.name}: use a PNG, JPEG, WebP, SVG or PDF file.`;
  if (err instanceof ApiError && err.status === 413) return `${file.name}: larger than ${LIMITS.maxUploadMB} MB.`;
  if (err instanceof ApiError && err.status === 403) return 'You can only view this project.';
  return `${file.name}: upload failed.`;
}

/** Uploads `files` (in parallel); the pictures in the order given, and why the others were left out. */
export async function uploadPictures(teamId: string, files: readonly File[], remember: (a: AssetMeta) => void, onEach?: () => void): Promise<{ pictures: StackPicture[]; problems: string[] }> {
  const problems: string[] = [];
  const pictures: (StackPicture | undefined)[] = [];
  await Promise.all(
    files.map(async (file, i) => {
      try {
        if (file.size > LIMITS.maxUploadMB * 1024 * 1024) return void problems.push(`${file.name}: larger than ${LIMITS.maxUploadMB} MB.`);
        const asset = await uploadAsset(teamId, file);
        if (asset.kind !== 'image' && asset.kind !== 'vector') return void problems.push(`${file.name}: not a picture.`);
        remember(asset);
        pictures[i] = { id: newId(), label: labelOf(file.name), kind: asset.kind, assetId: asset.id };
      } catch (err) {
        if (!(err instanceof UploadCancelled)) problems.push(reason(file, err));
      } finally {
        onEach?.();
      }
    }),
  );
  return { pictures: pictures.filter((p): p is StackPicture => !!p), problems };
}

/** Adds uploaded pictures to card `stackId`, or to a new card at `at` (one undo step). */
export function addPictures(d: ProjectDoc, pictures: readonly StackPicture[], target: { stackId: string } | { at: { x: number; y: number } }): SourceResult {
  if ('stackId' in target) return addPicturesToStack(d, target.stackId, pictures);
  const id = newId();
  const made = addStack(d, { id, board: target.at });
  return made.ok ? addPicturesToStack(made.doc, id, pictures) : made;
}

/** Uploads files into a card from inside the board (the card's drop zone and file picker). */
export function usePictureDrop() {
  const { teamId, readOnly, run, rememberAsset } = useBoard();
  const [busy, setBusy] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  async function add(files: readonly File[], target: { stackId: string }) {
    if (readOnly || files.length === 0) return;
    setErrors([]);
    setBusy(files.length);
    const { pictures, problems } = await uploadPictures(teamId, files, rememberAsset, () => setBusy((n) => n - 1));
    if (pictures.length) run((d) => addPictures(d, pictures, target));
    setErrors(problems);
  }

  return { add, busy: busy > 0, errors };
}

/** The files a drag carries (only while it carries files). */
export const filesOf = (e: { dataTransfer: DataTransfer }): File[] => Array.from(e.dataTransfer.files);
export const carriesFiles = (e: { dataTransfer: DataTransfer }) => e.dataTransfer.types.includes('Files');

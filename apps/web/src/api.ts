import { isPdf, pdfToPng } from './pdf';
/** Thin JSON client for the API (same origin under /api; the session cookie rides along). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface Me {
  user: { id: string; email: string; name: string };
  teams: { id: string; name: string; role: 'admin' | 'editor' | 'viewer' }[];
}

export interface AssetMeta {
  id: string;
  kind: 'image' | 'vector' | 'font';
  mime: string;
  width: number | null;
  height: number | null;
  fontFamily: string | null;
}

/** `page`: a PDF's page to keep (Q1; the API's default is the first). */
async function postAsset(teamId: string, file: File, page?: number): Promise<{ ok: boolean; status: number; data: unknown }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/teams/${teamId}/assets${page && page > 1 ? `?page=${page}` : ''}`, { method: 'POST', credentials: 'same-origin', body: form });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

/** Q1: the person closed the PDF page picker; nothing was uploaded (callers show no error). */
export class UploadCancelled extends Error {}

/**
 * Multipart upload of one file to the team's assets. A PDF (M3 / D55) goes up as is and comes back as one page in
 * vector (an SVG); where the slot takes only pixels (`pdf: 'image'`), or the server can't draw the PDF, the
 * browser draws that page to a PNG and uploads that instead (N2 / D52). Q1: a PDF of several pages asks which
 * page first (throws UploadCancelled when the person cancels).
 */
export async function uploadAsset(teamId: string, original: File, opts: { pdf?: 'vector' | 'image' } = {}): Promise<AssetMeta> {
  let file = original;
  if (await isPdf(original)) {
    const { pickPdfPage } = await import('./ui/PdfPageDialog');
    const page = await pickPdfPage(original);
    if (page === null) throw new UploadCancelled('cancelled');
    if (opts.pdf !== 'image') {
      const res = await postAsset(teamId, original, page);
      if (res.ok) return res.data as AssetMeta;
      if (res.status !== 501 && res.status !== 422) throw new ApiError(res.status, res.data);
    }
    try {
      file = await pdfToPng(original, page);
    } catch {
      throw new ApiError(415, { error: 'unreadable_pdf' });
    }
  }
  const res = await postAsset(teamId, file);
  if (!res.ok) throw new ApiError(res.status, res.data);
  return res.data as AssetMeta;
}

export const assetUrl = (teamId: string, assetId: string) => `/api/teams/${teamId}/assets/${assetId}/content`;

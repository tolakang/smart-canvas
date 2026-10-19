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

/** Multipart upload of one file to the team's assets. */
export async function uploadAsset(teamId: string, file: File): Promise<AssetMeta> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/teams/${teamId}/assets`, { method: 'POST', credentials: 'same-origin', body: form });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as AssetMeta;
}

export const assetUrl = (teamId: string, assetId: string) => `/api/teams/${teamId}/assets/${assetId}/content`;

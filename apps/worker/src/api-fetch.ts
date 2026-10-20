/** The production ApiFetch: the API over HTTP with the shared render token (RENDER_TOKEN). */
import type { ApiFetch } from './render';

export function httpApiFetch(apiUrl: string, renderToken: string): ApiFetch {
  const base = apiUrl.replace(/\/$/, '');
  return async (path) => {
    const res = await fetch(`${base}${path}`, { headers: { 'x-render-token': renderToken } });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      body: Buffer.from(await res.arrayBuffer()),
    };
  };
}

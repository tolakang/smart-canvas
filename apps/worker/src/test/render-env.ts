/** Shared setup for the Chromium render tests: the web app on a Vite dev server + an in-memory API. */
import { fileURLToPath } from 'node:url';
import type { ProjectDoc, SourceResult } from '@smart-canvas/core';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { CHROMIUM_ARGS, type ApiFetch } from '../render';

export const TEAM = '11111111-1111-4111-8111-111111111111';
export const PROJECT = '22222222-2222-4222-8222-222222222222';
const webRoot = fileURLToPath(new URL('../../../web', import.meta.url));

export const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

const json = (v: unknown) => ({ status: 200, contentType: 'application/json', body: Buffer.from(JSON.stringify(v)) });

/** Serves one project (no team fonts or assets unless given) and records the paths asked for. */
export function fakeApi(doc: ProjectDoc, assets: { id: string; width: number; height: number; mime: string; body: Buffer }[] = []) {
  const requested: string[] = [];
  const fetch: ApiFetch = async (path) => {
    requested.push(path);
    if (path === `/teams/${TEAM}/projects/${PROJECT}`) return json({ id: PROJECT, rev: 1, doc });
    if (path === `/teams/${TEAM}/fonts`) return json([]);
    if (path === `/teams/${TEAM}/assets`) return json(assets.map(({ id, width, height, mime }) => ({ id, kind: 'image', mime, width, height, fontFamily: null })));
    const a = assets.find((x) => path === `/teams/${TEAM}/assets/${x.id}/content`);
    if (a) return { status: 200, contentType: a.mime, body: a.body };
    return { status: 404, contentType: 'application/json', body: Buffer.from('{}') };
  };
  return { fetch, requested };
}

/** `apiUrl` sends the app's /api calls to a real API (the end-to-end test); render tests answer them in the worker. */
export async function startRenderEnv(apiUrl?: string): Promise<{ webUrl: string; browser: Browser; close: () => Promise<void> }> {
  const proxy = apiUrl ? { '/api': { target: apiUrl, rewrite: (p: string) => p.replace(/^\/api/, '') } } : undefined;
  const vite: ViteDevServer = await createServer({
    root: webRoot,
    configFile: `${webRoot}/vite.config.ts`,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1', ...(proxy && { proxy }) },
  });
  await vite.listen();
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  return {
    webUrl: vite.resolvedUrls?.local[0] ?? '',
    browser,
    close: async () => {
      await browser.close();
      await vite.close();
    },
  };
}

/**
 * Bare render page for the export worker (D27): /render/<teamId>/<projectId>/<target>?scale=<n>
 * <target> is 'main' or an output id. No app shell, transparent background.
 * Signals completion on <html data-render-ready="true"> only after every text font is loaded and every
 * image has decoded, so a screenshot is never taken half-drawn; "error" (with data-render-error) otherwise.
 */
import { masterScene, type InputSource, type ProjectDoc, type RenderScene } from '@smart-canvas/core';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, assetUrl } from '../api';
import { ensureFonts, registerTeamFonts, type TeamFont } from '../fonts/loader';
import { OutputRenderer } from './OutputRenderer';

export interface RenderRoute {
  teamId: string;
  projectId: string;
  target: string;
  scale: number;
}

export function parseRenderPath(pathname: string, search: string): RenderRoute | null {
  const m = /^\/render\/([^/]+)\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const scale = Number(new URLSearchParams(search).get('scale') ?? '1');
  return { teamId: m[1], projectId: m[2], target: m[3], scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

type Loaded = { scene: RenderScene; sources: InputSource[] } | { error: string };

function setStatus(status: 'true' | 'error', error?: string) {
  document.documentElement.dataset.renderReady = status;
  if (error) document.documentElement.dataset.renderError = error;
}

export function RenderPage({ route }: { route: RenderRoute }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('sc-render-page');
    let live = true;
    (async () => {
      const [project, fonts] = await Promise.all([
        api<{ doc: ProjectDoc }>('GET', `/teams/${route.teamId}/projects/${route.projectId}`),
        api<TeamFont[]>('GET', `/teams/${route.teamId}/fonts`),
      ]);
      registerTeamFonts(route.teamId, fonts);
      if (route.target !== 'main') {
        // Output layouts come from the engine (T4.x); until then only the main preview can be rendered.
        return { error: 'output_layout_unavailable' };
      }
      return { scene: masterScene(project.doc), sources: project.doc.sources };
    })().then(
      (r) => live && setLoaded(r),
      (e: unknown) => live && setLoaded({ error: e instanceof ApiError ? `api_${e.status}` : 'load_failed' }),
    );
    return () => {
      live = false;
    };
  }, [route.teamId, route.projectId, route.target]);

  // Ready = fonts for every text item loaded + every image decoded.
  useEffect(() => {
    if (!loaded) return;
    if ('error' in loaded) {
      setStatus('error', loaded.error);
      return;
    }
    const byId = new Map(loaded.sources.map((s) => [s.id, s]));
    const texts = loaded.scene.items.flatMap((item) => {
      const c = byId.get(item.sourceId)?.content;
      return c?.kind === 'text' ? [{ style: { ...c.style, ...item.style }, text: item.lines?.join('\n') ?? c.text }] : [];
    });
    const images = [...(root.current?.querySelectorAll('img') ?? [])];
    Promise.all([ensureFonts(texts), ...images.map((img) => img.decode())]).then(
      () => setStatus('true'),
      () => setStatus('error', 'image_failed'),
    );
  }, [loaded]);

  if (!loaded || 'error' in loaded) return null;
  return (
    <div ref={root}>
      <OutputRenderer
        scene={loaded.scene}
        sources={loaded.sources}
        assetUrl={(id) => assetUrl(route.teamId, id)}
        scale={route.scale}
        mode="export"
      />
    </div>
  );
}

/**
 * Bare render page for the export worker (D27): /render/<teamId>/<projectId>/<target>?scale=<n>&bleed=0|1
 * <target> is 'main' or an output id. Outputs are laid out by the engine (overrides, frozen frames) with
 * the same TextMeasure as the board; `bleed=0` crops to the trim box. `scale` defaults to the output's
 * export scale (dpi/96 or 1–4×), so the page is exactly the export pixel size (exportPixels).
 * No app shell, transparent background.
 * Signals completion on <html data-render-ready="true"> only after every text font is loaded and every
 * image has decoded, so a screenshot is never taken half-drawn; "error" (with data-render-error) otherwise.
 */
import {
  type AssetSize,
  computeLayout,
  exportScaleOf,
  masterScene,
  outputScene,
  layerSources,
  type LayerSource,
  type LayoutResult,
  type ProjectDoc,
  type RenderScene,
} from '@smart-canvas/core';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { api, ApiError, assetUrl, type AssetMeta } from '../api';
import { ensureFonts, prepareTextMeasure, registerTeamFonts, type FontRequest, type TeamFont } from '../fonts/loader';
import { frameToSvg } from './exportFile';
import { OutputRenderer } from './OutputRenderer';
import { measureTrim } from './trim';

export interface RenderRoute {
  teamId: string;
  projectId: string;
  target: string;
  /** Output pixels per design px; null = the target's own export scale (1 for main). */
  scale: number | null;
  /** Include the bleed (outputs); false crops to the trim box. */
  bleed: boolean;
}

export function parseRenderPath(pathname: string, search: string): RenderRoute | null {
  const m = /^\/render\/([^/]+)\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const q = new URLSearchParams(search);
  const scale = q.has('scale') ? Number(q.get('scale')) : NaN;
  return {
    teamId: m[1],
    projectId: m[2],
    target: m[3],
    scale: Number.isFinite(scale) && scale > 0 ? scale : null,
    bleed: q.get('bleed') !== '0',
  };
}

/** The trim box of an output scene: items shifted by the bleed, canvas = trim. */
export function cropToTrim(scene: RenderScene, layout: LayoutResult): RenderScene {
  const b = layout.metrics.bleed;
  if (b === 0) return scene;
  return {
    width: layout.metrics.trim.w,
    height: layout.metrics.trim.h,
    items: scene.items.map((i) => ({ ...i, frame: { ...i.frame, x: i.frame.x - b, y: i.frame.y - b } })),
  };
}

/** What an output's export draws: its laid-out scene, cropped to the trim box without bleed (shared with browser export, D31). */
export function exportScene(layout: LayoutResult, output: Parameters<typeof outputScene>[1], bleed: boolean): RenderScene {
  const full = outputScene(layout, output);
  return bleed ? full : cropToTrim(full, layout);
}

/** The text a scene draws, for loading its fonts. */
export function sceneTexts(scene: RenderScene, sources: readonly LayerSource[]): FontRequest[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return scene.items.flatMap((item) => {
    const source = byId.get(item.sourceId);
    if (source?.nested) return sceneTexts(source.nested.scene, sources); // T12.8: its texts too
    const c = source?.content;
    return c?.kind === 'text' ? [{ style: { ...c.style, ...item.style }, text: item.lines?.join('\n') ?? c.text }] : [];
  });
}

/** Resolves once every text font of the scene is loaded and every image in the frame has decoded. */
export async function frameReady(frame: HTMLElement, scene: RenderScene, sources: readonly LayerSource[]): Promise<void> {
  const masks = [...frame.querySelectorAll<HTMLElement>('[data-mask-src]')].map((el) => {
    const img = new Image();
    img.src = el.dataset.maskSrc ?? '';
    return img.decode();
  });
  await Promise.all([ensureFonts(sceneTexts(scene, sources)), ...[...frame.querySelectorAll('img')].map((img) => img.decode()), ...masks]);
}

/** The export frame: whole pixels (same rounding as exportPixels), clipping the canvas' fraction. */
export const RenderFrame = forwardRef<HTMLDivElement, { scene: RenderScene; sources: readonly LayerSource[]; assetSizes?: Record<string, AssetSize>; assetUrl: (id: string) => string; scale: number }>(
  function RenderFrame({ scene, sources, assetSizes, assetUrl: urlOf, scale }, ref) {
    const frame = { width: Math.round(scene.width * scale), height: Math.round(scene.height * scale) };
    return (
      <div ref={ref} className="sc-render-frame" style={{ ...frame, overflow: 'hidden' }} data-export-width={frame.width} data-export-height={frame.height} data-exact-width={scene.width * scale} data-exact-height={scene.height * scale}>
        <OutputRenderer scene={scene} sources={sources} assetSizes={assetSizes} assetUrl={urlOf} scale={scale} mode="export" />
      </div>
    );
  },
);

type Loaded = { scene: RenderScene; sources: LayerSource[]; sizes: Record<string, AssetSize>; scale: number } | { error: string };

function setStatus(status: 'true' | 'error', error?: string) {
  document.documentElement.dataset.renderReady = status;
  if (error) document.documentElement.dataset.renderError = error;
}

export function RenderPage({ route }: { route: RenderRoute }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('sc-render-page');
    // The worker builds SVG files with the same code as the browser (D31).
    (window as unknown as { scExport: unknown }).scExport = { frameToSvg };
    let live = true;
    (async () => {
      const [project, fonts] = await Promise.all([
        api<{ doc: ProjectDoc }>('GET', `/teams/${route.teamId}/projects/${route.projectId}`),
        api<TeamFont[]>('GET', `/teams/${route.teamId}/fonts`),
      ]);
      registerTeamFonts(route.teamId, fonts);
      const { doc } = project;
      // Same deps as the board: fonts loaded before measuring, intrinsic asset sizes (layout, and crops: T12.5).
      const assets = await api<AssetMeta[]>('GET', `/teams/${route.teamId}/assets`);
      const sizes: Record<string, AssetSize> = Object.fromEntries(assets.flatMap((a) => (a.width && a.height ? [[a.id, { width: a.width, height: a.height }]] : [])));
      // D37: fitted frames draw a picture's visible part — measured here exactly as on the board.
      const used = new Set(doc.sources.flatMap((s) => (s.content.kind === 'image' || s.content.kind === 'vector' ? [s.content.assetId, ...Object.values(s.content.variants ?? {})].filter((id): id is string => !!id) : [])));
      for (const a of assets) {
        const size = sizes[a.id];
        if (!size || !used.has(a.id)) continue;
        size.trim = (await measureTrim(assetUrl(route.teamId, a.id), a.mime)) ?? { x: 0, y: 0, w: 1, h: 1 };
      }
      const sources = layerSources(doc);
      if (route.target === 'main') return { scene: masterScene(doc), sources, sizes, scale: route.scale ?? 1 };
      const output = doc.outputs.find((o) => o.id === route.target);
      if (!output) return { error: 'output_not_found' };
      const styleOverride = new Map(output.overrides.map((o) => [o.sourceId, o.style]));
      const requests = sources.flatMap((s) =>
        s.content.kind === 'text' ? [{ style: { ...s.content.style, ...styleOverride.get(s.id) }, text: s.content.text }] : [],
      );
      const { measure, missing } = await prepareTextMeasure(requests);
      if (missing.length) return { error: 'font_missing' };
      const layout = computeLayout(doc, output.id, { measure, assets: sizes });
      return { scene: exportScene(layout, output, route.bleed), sources, sizes, scale: route.scale ?? exportScaleOf(output) };
    })().then(
      (r) => live && setLoaded(r),
      (e: unknown) => live && setLoaded({ error: e instanceof ApiError ? `api_${e.status}` : 'load_failed' }),
    );
    return () => {
      live = false;
    };
  }, [route.teamId, route.projectId, route.target, route.bleed, route.scale]);

  // Ready = fonts for every text item loaded + every image decoded.
  useEffect(() => {
    if (!loaded) return;
    if ('error' in loaded) {
      setStatus('error', loaded.error);
      return;
    }
    const frame = root.current;
    if (!frame) return;
    frameReady(frame, loaded.scene, loaded.sources).then(
      () => setStatus('true'),
      () => setStatus('error', 'image_failed'),
    );
  }, [loaded]);

  if (!loaded || 'error' in loaded) return null;
  return <RenderFrame ref={root} scene={loaded.scene} sources={loaded.sources} assetSizes={loaded.sizes} assetUrl={(id) => assetUrl(route.teamId, id)} scale={loaded.scale} />;
}

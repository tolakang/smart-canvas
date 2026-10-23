/**
 * What the layout engine needs in the browser: a TextMeasure (only after the text's fonts have loaded,
 * CLAUDE.md) and the intrinsic size of every image/vector asset.
 */
import { layerSources, type LayoutDeps, type ProjectDoc } from '@smart-canvas/core';
import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl, type AssetMeta } from '../api';
import { measureTrim } from '../render/trim';
import { prepareTextMeasure, type FontRequest } from '../fonts/loader';

export type AssetSizes = LayoutDeps['assets'];

/** The fonts every text layer needs, as a stable string (effect key). */
function fontRequestsJson(doc: ProjectDoc): string {
  const requests: FontRequest[] = layerSources(doc).flatMap((s) =>
    s.content.kind === 'text' ? [{ style: { fontFamily: s.content.style.fontFamily, fontWeight: s.content.style.fontWeight }, text: s.content.text }] : [],
  );
  return JSON.stringify(requests);
}

/** The picture assets a doc draws, as a stable string (effect key). */
export function usedAssetsKey(doc: ProjectDoc): string {
  const ids = new Set<string>();
  for (const s of doc.sources) {
    if (s.content.kind !== 'image' && s.content.kind !== 'vector') continue;
    if (s.content.assetId) ids.add(s.content.assetId);
    for (const v of Object.values(s.content.variants ?? {})) if (v) ids.add(v); // D43
  }
  return [...ids].sort().join(',');
}

/**
 * Sizes of the team's image and vector assets, plus any uploaded since (via `remember`), and — for the ones
 * `used` (comma-separated ids) — where their visible pixels are (D37 trim, measured one at a time).
 */
export function useAssetSizes(teamId: string, used = ''): { sizes: AssetSizes; remember: (a: AssetMeta) => void } {
  const [sizes, setSizes] = useState<AssetSizes>({});
  const [mimes, setMimes] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    api<AssetMeta[]>('GET', `/teams/${teamId}/assets`).then(
      (list) => {
        if (!live) return;
        const loaded: AssetSizes = {};
        for (const a of list) if (a.width && a.height) loaded[a.id] = { width: a.width, height: a.height };
        setSizes((s) => ({ ...loaded, ...s }));
        setMimes((m) => ({ ...Object.fromEntries(list.map((a) => [a.id, a.mime])), ...m }));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [teamId]);
  const remember = useMemo(
    () => (a: AssetMeta) => {
      const { width, height } = a;
      if (width && height) setSizes((s) => (s[a.id] ? s : { ...s, [a.id]: { width, height } }));
      setMimes((m) => (m[a.id] ? m : { ...m, [a.id]: a.mime }));
    },
    [],
  );

  // Trims of the used pictures whose size is known and trim isn't, one at a time (each decodes a picture).
  const pending = used
    .split(',')
    .filter((id) => id && sizes[id] && !sizes[id]?.trim)
    .join(',');
  useEffect(() => {
    if (!pending) return;
    let live = true;
    void (async () => {
      for (const id of pending.split(',')) {
        const trim = await measureTrim(assetUrl(teamId, id), mimes[id]);
        if (!live) return;
        // A picture that can't be measured counts as having no margins (it still draws, filling its frame).
        setSizes((s) => (s[id] && !s[id]?.trim ? { ...s, [id]: { ...(s[id] as { width: number; height: number }), trim: trim ?? { x: 0, y: 0, w: 1, h: 1 } } } : s));
      }
    })();
    return () => {
      live = false;
    };
  }, [pending, teamId, mimes]);
  return { sizes, remember };
}

/**
 * Layout deps for `doc`, or null until the first measure is ready. Fonts are (re)loaded whenever the
 * text, families or team fonts change; the previous measure stays in use meanwhile.
 */
export function useLayoutDeps(doc: ProjectDoc, sizes: AssetSizes, fontsKey: string): { deps: LayoutDeps | null; missingFonts: string[] } {
  const requests = fontRequestsJson(doc);
  const [measure, setMeasure] = useState<LayoutDeps['measure'] | null>(null);
  // D35: families that failed to load (their text draws in a fallback): an error on the nodes using them.
  const [missingFonts, setMissing] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    prepareTextMeasure(JSON.parse(requests) as FontRequest[]).then(
      (r) => {
        if (!live) return;
        setMeasure(() => r.measure);
        const missing = [...new Set(r.missing.map((m) => m.style.fontFamily))].sort();
        setMissing((cur) => (cur.join('\n') === missing.join('\n') ? cur : missing));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [requests, fontsKey]);
  const deps = useMemo(() => (measure ? { measure, assets: sizes } : null), [measure, sizes]);
  return { deps, missingFonts };
}

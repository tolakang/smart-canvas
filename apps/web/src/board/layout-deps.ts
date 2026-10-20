/**
 * What the layout engine needs in the browser: a TextMeasure (only after the text's fonts have loaded,
 * CLAUDE.md) and the intrinsic size of every image/vector asset.
 */
import { layerSources, type LayoutDeps, type ProjectDoc } from '@smart-canvas/core';
import { useEffect, useMemo, useState } from 'react';
import { api, type AssetMeta } from '../api';
import { prepareTextMeasure, type FontRequest } from '../fonts/loader';

export type AssetSizes = LayoutDeps['assets'];

/** The fonts every text layer needs (inputs and text variants, T12.6), as a stable string (effect key). */
function fontRequestsJson(doc: ProjectDoc): string {
  const requests: FontRequest[] = layerSources(doc).flatMap((s) =>
    s.content.kind === 'text' ? [{ style: { fontFamily: s.content.style.fontFamily, fontWeight: s.content.style.fontWeight }, text: s.content.text }] : [],
  );
  return JSON.stringify(requests);
}

/** Sizes of the team's image and vector assets, plus any uploaded since (via `remember`). */
export function useAssetSizes(teamId: string): { sizes: AssetSizes; remember: (a: AssetMeta) => void } {
  const [sizes, setSizes] = useState<AssetSizes>({});
  useEffect(() => {
    let live = true;
    api<AssetMeta[]>('GET', `/teams/${teamId}/assets`).then(
      (list) => {
        if (!live) return;
        const loaded: AssetSizes = {};
        for (const a of list) if (a.width && a.height) loaded[a.id] = { width: a.width, height: a.height };
        setSizes((s) => ({ ...loaded, ...s }));
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
    },
    [],
  );
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

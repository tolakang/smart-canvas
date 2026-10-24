/**
 * D64 (U5b): the project's picture on the Projects home. A few seconds after the board opens, and after each save
 * that settles, the board draws one Preview small (the same browser export as the Export dialog, D31) and stores it
 * on the API. Editors only; a failure is ignored (the card keeps its colour cover until the next try).
 */
import { layerSources, toDesignPx, type ExportOptions, type LayoutDeps, type OutputNode, type ProjectDoc } from '@smart-canvas/core';
import { useEffect, useRef } from 'react';
import { assetUrl } from '../api';
import { exportInBrowser } from '../render/browserExport';
import type { SaveState } from './autosave';

/** The long edge of the stored picture, in px. */
export const THUMB_EDGE = 640;
/** How long the doc must sit saved before it is drawn. */
export const THUMB_DELAY_MS = 4_000;
/** The home cards' shape (width / height); the Preview closest to it is drawn. */
const CARD_RATIO = 16 / 10;

/** The Preview the card shows: the one closest to the card's shape, first in order on a tie; none without Previews. */
export function thumbnailOutput(doc: ProjectDoc): OutputNode | null {
  let best: OutputNode | null = null;
  let bestScore = Infinity;
  for (const o of doc.outputs) {
    const score = Math.abs(Math.log(o.size.width / o.size.height / CARD_RATIO));
    if (score < bestScore - 1e-9) [best, bestScore] = [o, score];
  }
  return best;
}

/** Something to show: a picture or some text in a visible layer (a blank board keeps its colour cover). */
export function hasArtwork(doc: ProjectDoc): boolean {
  return layerSources(doc).some((s) => {
    const c = s.content;
    return s.visible && (c.kind === 'image' || c.kind === 'vector' ? Boolean(c.assetId) : c.kind === 'text' && Boolean(c.text.trim()));
  });
}

/** Export options that draw `o` with its long edge at THUMB_EDGE px (never larger than the Preview itself). */
export function thumbnailOptions(o: OutputNode): ExportOptions {
  const longEdge = Math.max(toDesignPx(o.size.width, o.size.unit), toDesignPx(o.size.height, o.size.unit));
  const k = Math.min(1, THUMB_EDGE / longEdge);
  return { withBleed: false, quality: 80, ...(o.size.unit === 'mm' ? { dpi: 96 * k } : { scale: k }) };
}

/** Waits until no pointer is down and the browser is idle, so drawing never stalls a drag or a pinch. */
function whenIdle(signal: { live: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 5_000 }) : setTimeout(cb, 200));
    const check = () => {
      if (!signal.live) return;
      if (down.size > 0) setTimeout(check, 1_000);
      else idle(() => (down.size > 0 ? setTimeout(check, 1_000) : resolve()));
    };
    check();
  });
}
/** Pointers pressed on the page now (cleared when the window loses focus, in case a release was missed). */
const down = new Set<number>();
let tracking = false;
function trackPointers() {
  if (tracking) return;
  tracking = true;
  window.addEventListener('pointerdown', (e) => down.add(e.pointerId), true);
  const up = (e: PointerEvent) => down.delete(e.pointerId);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', () => down.clear());
}

export function useProjectThumbnail(p: { teamId: string; projectUrl: string; doc: ProjectDoc; deps: LayoutDeps | null; saveState: SaveState; canEdit: boolean }) {
  const { teamId, projectUrl, doc, deps, saveState, canEdit } = p;
  const drawn = useRef<ProjectDoc | null>(null);
  useEffect(() => {
    if (!canEdit || !deps || saveState !== 'saved' || drawn.current === doc) return;
    const output = hasArtwork(doc) ? thumbnailOutput(doc) : null;
    if (!output) return;
    trackPointers();
    const signal = { live: true };
    const t = setTimeout(async () => {
      try {
        await whenIdle(signal);
        if (!signal.live) return;
        const file = await exportInBrowser({ doc, outputId: output.id, format: 'jpg', options: thumbnailOptions(output), layoutDeps: deps, assetUrl: (a) => assetUrl(teamId, a) });
        if (!signal.live) return;
        const res = await fetch(`/api${projectUrl}/thumbnail`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': file.blob.type }, body: file.blob });
        if (res.ok) drawn.current = doc;
      } catch {
        // keep the last picture; the next save tries again
      }
    }, THUMB_DELAY_MS);
    return () => {
      signal.live = false;
      clearTimeout(t);
    };
  }, [teamId, projectUrl, doc, deps, saveState, canEdit]);
}

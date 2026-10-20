/**
 * SVG export (T6.4): the ready render page's own DOM, wrapped in an SVG <foreignObject>, so the SVG is
 * drawn by the same OutputRenderer as preview and export (no second rendering path). Text stays text by
 * default; with `outlineText` (D23) each text layer becomes glyph paths in place (svg-outline.ts).
 * It is self-contained: images become data: URIs and the @font-face rules of the families still drawn as
 * live text are embedded with their font files.
 */
import type { Page } from 'playwright';
import { FRAME, RenderError } from './render';
import { outlineTextLayers } from './svg-outline';

export interface SvgResult {
  bytes: Buffer;
  mime: 'image/svg+xml';
  width: number;
  height: number;
  /** Text layers drawn as outlines / kept as live text (fonts it could not outline). */
  outlined: number;
  live: number;
}

export async function exportSvg(page: Page, opts: { outlineText?: boolean } = {}): Promise<SvgResult> {
  const outlines = opts.outlineText ? await outlineTextLayers(page) : [];
  // The render page's own builder (apps/web/src/render/exportFile.ts), shared with browser export (D31).
  const out = await page
    .locator(FRAME)
    .first()
    .evaluate(
      (frame, outlines) => (window as unknown as { scExport: { frameToSvg: (f: HTMLElement, o: (string | null)[]) => Promise<{ svg: string; width: number; height: number; texts: number }> } }).scExport.frameToSvg(frame as HTMLElement, outlines),
      outlines,
    );
  if (!out.width || !out.height) throw new RenderError('render: nothing drawn');
  const outlined = outlines.filter(Boolean).length;
  return { bytes: Buffer.from(out.svg, 'utf8'), mime: 'image/svg+xml', width: out.width, height: out.height, outlined, live: out.texts - outlined };
}

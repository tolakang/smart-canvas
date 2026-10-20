/**
 * PDF export (T6.3, D23): Chromium prints the ready render page, so text and fills stay vector (images
 * stay images). The page is the output in mm including its bleed. Crop marks (default on when there is
 * bleed) are drawn in an extra slug margin around it, at the trim lines and clear of the bleed, so they
 * never sit on the artwork. RGB only in v1 (D2).
 */
import type { Page } from 'playwright';
import { FRAME, RenderError } from './render';

/** Design px per mm (96 per inch, D17); the render page is drawn at scale 1 for PDF. */
const PX_PER_MM = 96 / 25.4;
/** Slug margin around the bleed box that carries the crop marks. */
export const SLUG_MM = 8;
const MARK_MM = 5; // mark length
const MARK_GAP_MM = 1; // gap between the bleed edge and a mark

export interface PdfOptions {
  /** Bleed of the output in mm (the render page includes it). */
  bleedMm: number;
  /** Default: on when bleedMm > 0. */
  cropMarks?: boolean;
}

export interface PdfResult {
  bytes: Buffer;
  mime: 'application/pdf';
  /** Page size in mm. */
  widthMm: number;
  heightMm: number;
}

export async function exportPdf(page: Page, opts: PdfOptions): Promise<PdfResult> {
  const marks = opts.cropMarks ?? opts.bleedMm > 0;
  // Vector output: use the exact canvas size (the frame is rounded to whole pixels for raster exports).
  const size = await page.locator(FRAME).first().evaluate((el) => {
    const w = Number(el.dataset.exactWidth);
    const h = Number(el.dataset.exactHeight);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    return { w, h };
  });
  if (!size.w || !size.h) throw new RenderError('render: nothing drawn');
  const slug = marks ? SLUG_MM * PX_PER_MM : 0;
  const pageW = size.w + 2 * slug;
  const pageH = size.h + 2 * slug;
  await page.evaluate(
    ({ slug, bleed, len, gap, marks }) => {
      const frame = document.querySelector<HTMLElement>('.sc-render-frame');
      if (!frame) return;
      const style = document.createElement('style');
      style.textContent = '@page { margin: 0 } html, body { margin: 0; padding: 0 }';
      document.head.append(style);
      frame.style.position = 'absolute';
      frame.style.left = `${slug}px`;
      frame.style.top = `${slug}px`;
      if (!marks) return;
      const w = parseFloat(frame.style.width);
      const h = parseFloat(frame.style.height);
      // Trim lines in page coordinates.
      const xs = [slug + bleed, slug + w - bleed];
      const ys = [slug + bleed, slug + h - bleed];
      const line = (x: number, y: number, lw: number, lh: number) => {
        const d = document.createElement('div');
        d.className = 'sc-crop-mark';
        Object.assign(d.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${lw}px`, height: `${lh}px`, background: '#000' });
        document.body.append(d);
      };
      const t = 0.5; // ~0.375 pt hairline
      for (const x of xs) {
        line(x - t / 2, slug - gap - len, t, len); // above
        line(x - t / 2, slug + h + gap, t, len); // below
      }
      for (const y of ys) {
        line(slug - gap - len, y - t / 2, len, t); // left
        line(slug + w + gap, y - t / 2, len, t); // right
      }
    },
    { slug, bleed: opts.bleedMm * PX_PER_MM, len: MARK_MM * PX_PER_MM, gap: MARK_GAP_MM * PX_PER_MM, marks },
  );
  const bytes = await page.pdf({ width: `${(pageW / PX_PER_MM).toFixed(3)}mm`, height: `${(pageH / PX_PER_MM).toFixed(3)}mm`, printBackground: true, pageRanges: '1', margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  return { bytes, mime: 'application/pdf', widthMm: pageW / PX_PER_MM, heightMm: pageH / PX_PER_MM };
}

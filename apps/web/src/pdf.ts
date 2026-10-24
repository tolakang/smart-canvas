/**
 * N2: PDF uploads, the pixel path (M3 / D55: a PDF normally goes up as is and the API keeps the chosen page in
 * vector; this path serves slots that take only pixels and servers without the converter). A PDF's page is
 * rasterised in the browser to a transparent PNG (longest side PDF_LONG_SIDE px) and that PNG is what gets
 * uploaded, so the API's magic-byte check, the 50 MB cap, the renderer and the export worker stay as they are.
 * Q1: a PDF of several pages asks which page (thumbnails from here). pdf.js loads only when a PDF is picked.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Longest side of the rasterised page, in pixels: sharp enough for a full-bleed print-size output. */
export const PDF_LONG_SIDE = 4000;

/** True when the file starts with the PDF signature `%PDF-` (the name and type are not trusted). */
export async function isPdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

export class PdfError extends Error {}

/** An open PDF: its page count, page thumbnails, and closing it. Throws PdfError when the PDF can't be read. */
export interface OpenPdf {
  pages: number;
  /** Page `n` (1-based) as an image URL whose longest side is `px`. */
  thumbnail(n: number, px: number): Promise<string>;
  close(): void;
}

async function load(file: Blob): Promise<{ pdf: PDFDocumentProxy; close: () => void }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return { pdf: await task.promise, close: () => void task.destroy() };
  } catch {
    void task.destroy();
    throw new PdfError('unreadable');
  }
}

/** Draws page `n` onto a new canvas whose longest side is `px`. */
async function draw(pdf: PDFDocumentProxy, n: number, px: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: px / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new PdfError('no canvas');
  await page.render({ canvas, canvasContext, viewport, background: 'rgba(0,0,0,0)' }).promise;
  return canvas;
}

export async function openPdf(file: Blob): Promise<OpenPdf> {
  const { pdf, close } = await load(file);
  return {
    pages: pdf.numPages,
    thumbnail: async (n, px) => (await draw(pdf, n, px)).toDataURL('image/png'),
    close,
  };
}

/** Page `page` (1-based, default the first) of `file` as a PNG file named after it. Throws PdfError when it can't. */
export async function pdfToPng(file: File, page = 1): Promise<File> {
  const { pdf, close } = await load(file);
  try {
    if (page < 1 || page > pdf.numPages) throw new PdfError('no page');
    const canvas = await draw(pdf, page, PDF_LONG_SIDE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new PdfError('no png');
    const name = file.name.replace(/\.pdf$/i, '') || 'page';
    return new File([blob], `${name}${page > 1 ? `-p${page}` : ''}.png`, { type: 'image/png' });
  } catch (err) {
    throw err instanceof PdfError ? err : new PdfError('unreadable');
  } finally {
    close();
  }
}

/**
 * N2: PDF uploads, the pixel path (M3 / D55: a PDF normally goes up as is and the API keeps its first page in
 * vector; this path serves slots that take only pixels and servers without the converter). A PDF's first page is rasterised in the browser to a transparent PNG (longest side
 * PDF_LONG_SIDE px) and that PNG is what gets uploaded, so the API's magic-byte check, the 50 MB cap, the
 * renderer and the export worker stay as they are. pdf.js loads only when a PDF is picked.
 */

/** Longest side of the rasterised page, in pixels: sharp enough for a full-bleed print-size output. */
export const PDF_LONG_SIDE = 4000;

/** True when the file starts with the PDF signature `%PDF-` (the name and type are not trusted). */
export async function isPdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

export class PdfError extends Error {}

/** The first page of `file` as a PNG file named after it. Throws PdfError when the PDF can't be read. */
export async function pdfToPng(file: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch {
    void task.destroy();
    throw new PdfError('unreadable');
  }
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PDF_LONG_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new PdfError('no canvas');
    await page.render({ canvas, canvasContext, viewport, background: 'rgba(0,0,0,0)' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new PdfError('no png');
    return new File([blob], `${file.name.replace(/\.pdf$/i, '') || 'page'}.png`, { type: 'image/png' });
  } catch (err) {
    throw err instanceof PdfError ? err : new PdfError('unreadable');
  } finally {
    void task.destroy();
  }
}

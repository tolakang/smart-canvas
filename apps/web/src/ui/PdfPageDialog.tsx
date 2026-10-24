/**
 * Q1: which page of a PDF to upload. A PDF of one page needs no question; for more, a modal grid of page
 * thumbnails (drawn by pdf.js, the first THUMBS of them; later pages by number) — tap or click one, or cancel.
 * `pickPdfPage` works from any upload path: it mounts its own dialog and resolves with the page (1-based) or null.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { openPdf, PdfError, type OpenPdf } from '../pdf';

/** Pages drawn as thumbnails; a longer PDF lists the rest by number. */
const THUMBS = 48;
const THUMB_PX = 160;

function PdfPageDialog({ name, pdf, onDone }: { name: string; pdf: OpenPdf; onDone: (page: number | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // Thumbnails one after another, so the first pages show at once.
  useEffect(() => {
    let live = true;
    void (async () => {
      for (let n = 1; n <= Math.min(pdf.pages, THUMBS) && live; n++) {
        const url = await pdf.thumbnail(n, THUMB_PX).catch(() => '');
        if (live && url) setThumbs((t) => ({ ...t, [n]: url }));
      }
    })();
    return () => {
      live = false;
    };
  }, [pdf]);
  return (
    <dialog ref={ref} className="sc-dialog" aria-labelledby="pdf-page-title" onCancel={() => onDone(null)}>
      <div className="sc-card sc-pdfpages">
        <h2 id="pdf-page-title">Which page?</h2>
        <p className="sc-muted">
          {name} has {pdf.pages} pages. Pick the one to use.
        </p>
        <ul className="sc-pdfpages__grid">
          {Array.from({ length: pdf.pages }, (_, i) => i + 1).map((n) => (
            <li key={n}>
              <button type="button" className="sc-pdfpages__page" aria-label={`Page ${n}`} onClick={() => onDone(n)}>
                {thumbs[n] ? <img src={thumbs[n]} alt="" draggable={false} /> : <span className="sc-pdfpages__blank" aria-hidden="true" />}
                <span>{n}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sc-form__actions">
          <button type="button" className="sc-btn" onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** One question at a time: a drop of several PDFs asks about each in turn. */
let queue: Promise<unknown> = Promise.resolve();

/** The page of `file` (a PDF) to upload: 1 for a single page, else what the person picks (null = cancelled). */
export function pickPdfPage(file: File): Promise<number | null> {
  const next = queue.then(() => ask(file));
  queue = next.catch(() => undefined);
  return next;
}

async function ask(file: File): Promise<number | null> {
  let pdf: OpenPdf;
  try {
    pdf = await openPdf(file);
  } catch (err) {
    if (err instanceof PdfError) return 1; // unreadable here: the server (or the pixel path) says so
    throw err;
  }
  if (pdf.pages <= 1) {
    pdf.close();
    return 1;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    root.render(
      <PdfPageDialog
        name={file.name}
        pdf={pdf}
        onDone={(page) => {
          root.unmount();
          host.remove();
          pdf.close();
          resolve(page);
        }}
      />,
    );
  });
}

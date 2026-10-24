/**
 * M3 / D55: a PDF's page (the first, or the one asked for, Q1) as SVG, kept as vector. Poppler's `pdftocairo -svg` draws the page with cairo:
 * text becomes glyph outlines (so the fonts are kept without shipping them), embedded pictures become
 * data:image/png, and links, forms and JavaScript are not drawn at all. The SVG then goes through the same
 * sanitizer as an uploaded SVG. The converter runs as a separate process in a private temp dir, with a time
 * limit, no environment beyond PATH, and at most CONCURRENCY at a time; its output is capped like an upload.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** No converter on this server (pdftocairo missing): the browser falls back to a raster page (D52). */
export class PdfUnavailable extends Error {}
/** The PDF couldn't be drawn (broken, encrypted, too slow or too big). */
export class PdfRejected extends Error {}

export const isPdf = (buf: Uint8Array) => buf.length >= 5 && String.fromCharCode(...buf.subarray(0, 5)) === '%PDF-';

const CONCURRENCY = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export interface PdfOptions {
  /** The page to draw, 1-based (default 1). A page past the last is rejected. */
  page?: number;
  /** The converter binary (tests point it elsewhere). */
  bin?: string;
  timeoutMs?: number;
  maxBytes: number;
}

export function pdfPageToSvg(pdf: Uint8Array, { page = 1, bin = 'pdftocairo', timeoutMs = 30_000, maxBytes }: PdfOptions): Promise<string> {
  return slot(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sc-pdf-'));
    try {
      const input = join(dir, 'in.pdf');
      const output = join(dir, 'out.svg');
      await writeFile(input, pdf);
      await new Promise<void>((resolve, reject) => {
        execFile(
          bin,
          ['-svg', '-f', String(page), '-l', String(page), '-q', input, output],
          { cwd: dir, timeout: timeoutMs, killSignal: 'SIGKILL', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, maxBuffer: 64 * 1024 },
          (err) => {
            if (!err) return resolve();
            reject((err as NodeJS.ErrnoException).code === 'ENOENT' ? new PdfUnavailable('pdftocairo not installed') : new PdfRejected(err.killed ? 'timed out' : 'unreadable'));
          },
        );
      });
      const size = await stat(output).then(
        (s) => s.size,
        () => -1,
      );
      if (size <= 0) throw new PdfRejected('no page');
      if (size > maxBytes) throw new PdfRejected('too large');
      return await readFile(output, 'utf8');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

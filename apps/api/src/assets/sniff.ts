/** Upload type detection from magic bytes (the client's filename and Content-Type are ignored). */
export type Sniffed =
  | { kind: 'image'; mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' }
  | { kind: 'vector'; mime: 'image/svg+xml'; ext: 'svg' };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (buf: Uint8Array, bytes: number[], at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// Optional BOM, XML declaration, comments and a DOCTYPE without an internal subset, then <svg.
const SVG_HEAD =
  /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^[>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/i;

export function sniff(buf: Uint8Array): Sniffed | null {
  if (startsWith(buf, PNG)) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) {
    return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  }
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, 4096));
  if (SVG_HEAD.test(head)) return { kind: 'vector', mime: 'image/svg+xml', ext: 'svg' };
  return null;
}

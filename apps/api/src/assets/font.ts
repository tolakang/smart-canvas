import { create } from 'fontkit';

const MAX_FAMILY = 200;

/**
 * Parses an uploaded font and returns its family name, or null if it is not a single usable font.
 * Parsing the whole table directory is the validation: a file that only has the right magic bytes fails here.
 */
export function readFontFamily(buf: Uint8Array): string | null {
  try {
    const font = create(Buffer.from(buf));
    if (!('familyName' in font) || 'fonts' in font) return null; // collections are rejected
    void font.numGlyphs; // forces maxp/head to be read
    // eslint-disable-next-line no-control-regex
    const family = String(font.familyName ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return family ? family.slice(0, MAX_FAMILY) : null;
  } catch {
    return null;
  }
}

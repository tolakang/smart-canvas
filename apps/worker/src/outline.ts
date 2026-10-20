/**
 * Spike S3 (O5): text as outlines for SVG export. HarfBuzz shapes the run (Khmer reordering, subscript
 * stacks, mark positioning) and gives each glyph's outline, so an exported SVG needs no fonts.
 * HarfBuzz reads plain sfnt (TTF/OTF) only; the bundled fonts are WOFF, so `woffToSfnt` unpacks them.
 * harfbuzzjs frees its objects itself (FinalizationRegistry).
 */
import { inflateSync } from 'node:zlib';
import * as hb from 'harfbuzzjs';

/** WOFF 1.0 → sfnt: inflate each table and write a plain table directory. */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const w = Buffer.from(woff.buffer, woff.byteOffset, woff.byteLength);
  if (w.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF 1.0 file');
  const flavor = w.readUInt32BE(4);
  const count = w.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const o = 44 + i * 20;
    const offset = w.readUInt32BE(o + 4);
    const compLength = w.readUInt32BE(o + 8);
    const origLength = w.readUInt32BE(o + 12);
    const raw = w.subarray(offset, offset + compLength);
    return { tag: w.readUInt32BE(o), checksum: w.readUInt32BE(o + 16), data: compLength < origLength ? inflateSync(raw) : raw };
  });
  let log2 = 0;
  while (1 << (log2 + 1) <= count) log2++;
  const dir = Buffer.alloc(12 + 16 * count);
  dir.writeUInt32BE(flavor, 0);
  dir.writeUInt16BE(count, 4);
  dir.writeUInt16BE(16 << log2, 6); // searchRange
  dir.writeUInt16BE(log2, 8); // entrySelector
  dir.writeUInt16BE(count * 16 - (16 << log2), 10); // rangeShift
  const parts: Buffer[] = [dir];
  let at = dir.length;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    dir.writeUInt32BE(t.tag, o);
    dir.writeUInt32BE(t.checksum, o + 4);
    dir.writeUInt32BE(at, o + 8);
    dir.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad));
    at += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

export interface OutlineFont {
  font: hb.Font;
  upem: number;
  /** Code points this face is used for: in its @font-face unicode-range (if any) and in its cmap. */
  covers: (cp: number) => boolean;
}

/** `unicodeRange` is the face's CSS `unicode-range` value, e.g. "U+0000-00FF,U+0131". */
export function loadOutlineFont(sfnt: Uint8Array, unicodeRange?: string): OutlineFont {
  const bytes = sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength) as ArrayBuffer;
  const face = new hb.Face(new hb.Blob(bytes));
  const cmap = new Set(face.collectUnicodes());
  const ranges = unicodeRange ? parseUnicodeRange(unicodeRange) : null;
  return {
    font: new hb.Font(face),
    upem: face.upem,
    covers: (cp) => cmap.has(cp) && (!ranges || ranges.some(([a, b]) => cp >= a && cp <= b)),
  };
}

export function parseUnicodeRange(value: string): [number, number][] {
  return value.split(',').map((part) => {
    const [a = '0', b = a] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(a, 16), parseInt(b, 16)];
  });
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Splits a line into runs by face, like the browser's font matching: each grapheme goes to the first face
 * (in priority order) that covers all of its code points, else the first face. Bundled families are split
 * into Khmer / Latin / Latin-ext faces by unicode-range, so a mixed line needs several. Pass faces of one
 * family in reverse @font-face order (CSS checks the last declared face first).
 */
export function fontRuns(fonts: readonly OutlineFont[], text: string): { font: OutlineFont; text: string }[] {
  const runs: { font: OutlineFont; text: string }[] = [];
  for (const { segment } of graphemes.segment(text)) {
    const cps = [...segment].map((c) => c.codePointAt(0) ?? 0);
    const font = fonts.find((f) => cps.every((cp) => f.covers(cp))) ?? fonts[0];
    if (!font) throw new Error('no fonts');
    const last = runs.at(-1);
    if (last?.font === font) last.text += segment;
    else runs.push({ font, text: segment });
  }
  return runs;
}

/**
 * One line of text as SVG paths, origin at the start of the baseline, y down (SVG). `fonts` is the
 * fallback order. `advance` is the shaped width in px (it matches the browser's measure of the same run).
 */
export function outlineLine(fonts: readonly OutlineFont[], text: string, fontPx: number, letterSpacingPx = 0): { svg: string; advance: number } {
  let x = 0;
  const paths: string[] = [];
  for (const run of fontRuns(fonts, text)) {
    const { font, upem } = run.font;
    const buffer = new hb.Buffer();
    buffer.addText(run.text);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const scale = fontPx / upem;
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    for (const [i, glyph] of infos.entries()) {
      const p = positions[i];
      if (!p) continue;
      const d = font.glyphToPath(glyph.codepoint);
      const gx = x + p.xOffset * scale;
      const gy = -p.yOffset * scale;
      if (d) paths.push(`<path transform="translate(${round(gx)} ${round(gy)}) scale(${round(scale)} ${round(-scale)})" d="${d}"/>`);
      // Letter spacing goes after each cluster, like CSS (marks and subscripts share their base's cluster).
      const next = infos[i + 1];
      x += p.xAdvance * scale + (letterSpacingPx && (!next || next.cluster !== glyph.cluster) ? letterSpacingPx : 0);
    }
  }
  return { svg: paths.join(''), advance: x };
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

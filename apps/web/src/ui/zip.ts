/**
 * A minimal ZIP writer (D31: "download all" for files made in the browser). Entries are stored, not
 * compressed: PNG / JPG / WebP / PDF are already compressed, so deflate would add code and time for
 * nothing. UTF-8 names (flag bit 11).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** The ZIP bytes for `entries` (dates fixed at 1980-01-01; names made unique with " (2)", " (3)"…). */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const seen = new Map<string, number>();
  const files = entries.map((e) => {
    const n = (seen.get(e.name) ?? 0) + 1;
    seen.set(e.name, n);
    const name = n === 1 ? e.name : e.name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext}`);
    return { name: enc.encode(name), data: e.data, crc: crc32(e.data) };
  });
  const local = files.reduce((s, f) => s + 30 + f.name.length + f.data.length, 0);
  const central = files.reduce((s, f) => s + 46 + f.name.length, 0);
  const out = new Uint8Array(local + central + 22);
  const v = new DataView(out.buffer);
  let p = 0;
  const offsets: number[] = [];
  const DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  for (const f of files) {
    offsets.push(p);
    v.setUint32(p, 0x04034b50, true);
    v.setUint16(p + 4, 20, true); // version needed
    v.setUint16(p + 6, 0x0800, true); // UTF-8 names
    v.setUint16(p + 8, 0, true); // stored
    v.setUint16(p + 10, 0, true);
    v.setUint16(p + 12, DATE, true);
    v.setUint32(p + 14, f.crc, true);
    v.setUint32(p + 18, f.data.length, true);
    v.setUint32(p + 22, f.data.length, true);
    v.setUint16(p + 26, f.name.length, true);
    v.setUint16(p + 28, 0, true);
    out.set(f.name, p + 30);
    out.set(f.data, p + 30 + f.name.length);
    p += 30 + f.name.length + f.data.length;
  }
  const cd = p;
  files.forEach((f, i) => {
    v.setUint32(p, 0x02014b50, true);
    v.setUint16(p + 4, 20, true);
    v.setUint16(p + 6, 20, true);
    v.setUint16(p + 8, 0x0800, true);
    v.setUint16(p + 10, 0, true);
    v.setUint16(p + 12, 0, true);
    v.setUint16(p + 14, DATE, true);
    v.setUint32(p + 16, f.crc, true);
    v.setUint32(p + 20, f.data.length, true);
    v.setUint32(p + 24, f.data.length, true);
    v.setUint16(p + 28, f.name.length, true);
    v.setUint32(p + 42, offsets[i] ?? 0, true);
    out.set(f.name, p + 46);
    p += 46 + f.name.length;
  });
  v.setUint32(p, 0x06054b50, true);
  v.setUint16(p + 8, files.length, true);
  v.setUint16(p + 10, files.length, true);
  v.setUint32(p + 12, p - cd, true);
  v.setUint32(p + 16, cd, true);
  return out;
}

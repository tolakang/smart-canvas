/**
 * D63 review: a Preview's approval remembers what it looked like. `previewFingerprint` hashes what an output draws —
 * its size and bleed, and each laid-out layer's frame, text lines and content — so the board can tell
 * "Changed since approved". Only the hash is stored (with the approval); layout stays computed.
 */
import type { ProjectDoc } from './model';
import type { LayoutResult } from './layout/types';

/** JSON with sorted keys, so equal values give equal strings. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** cyrb53: a fast 53-bit string hash (not for security), as 14 hex digits. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Frames to 1/100 design px: float noise between machines doesn't count as a change. */
const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 100) / 100);

/** The fingerprint of output `outputId` as laid out in `layout` (from computeLayout); '' when it doesn't exist. */
export function previewFingerprint(doc: ProjectDoc, outputId: string, layout: LayoutResult): string {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) return '';
  const sources = new Map(doc.sources.map((s) => [s.id, s]));
  return hash(
    stable({
      size: output.size,
      bleedMm: output.bleedMm ?? 0,
      items: layout.items.map((i) => {
        const s = sources.get(i.sourceId);
        const f = i.frame;
        return {
          id: i.sourceId,
          frame: [f.x, f.y, f.w, f.h, f.rotation ?? 0, f.shear ?? 0].map(round),
          fontSizePx: round(i.fontSizePx),
          lines: i.lines,
          assetId: i.assetId,
          content: s?.content,
          visible: s?.visible,
        };
      }),
    }),
  );
}

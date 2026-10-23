/**
 * The master preview ('main') and its layouts (D42, D50). D56: there are no other master previews, so the
 * only composition edit left here is the size.
 */
import { compositionById, withComposition } from './graph';
import type { ProjectDoc, Size } from './model';
import type { SourceResult } from './sources';

export function setCompositionSize(doc: ProjectDoc, id: string, size: Size): SourceResult {
  if (!compositionById(doc, id)) return { ok: false, error: 'not_found' };
  if (!(size.width > 0 && size.height > 0 && size.width <= 100_000 && size.height <= 100_000)) return { ok: false, error: 'invalid' };
  return { ok: true, doc: withComposition(doc, id, (c) => ({ ...c, size: { ...size } })) };
}

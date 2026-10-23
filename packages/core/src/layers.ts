/**
 * The layers a composition row can show (D56): the inputs. A Headline card's language that isn't in use is
 * drawn nowhere (D44), as if hidden. (Process nodes and compositions used as layers were retired in D56.)
 */
import { unusedLanguageInputs } from './languages';
import type { InputSource, ProjectDoc } from './model';

/** A layer as the layout and renderer see it: an input. */
export type LayerSource = InputSource;

/** Every layer a row can show: the inputs, a Headline card's unused language hidden. */
export function layerSources(doc: ProjectDoc): LayerSource[] {
  const off = unusedLanguageInputs(doc);
  return off.size ? doc.sources.map((s) => (off.has(s.id) ? { ...s, visible: false } : s)) : doc.sources;
}

export function layerSource(doc: ProjectDoc, id: string): LayerSource | undefined {
  return layerSources(doc).find((s) => s.id === id);
}

/** Can `id` be a row (an input)? */
export function isLayerNode(doc: ProjectDoc, id: string): boolean {
  return doc.sources.some((s) => s.id === id);
}

/** Intrinsic size of a layer's picture, from the asset sizes the layout and renderer already have. Undefined when unknown. */
export function layerAssetSize(layer: InputSource, assets: Record<string, { width: number; height: number }>): { width: number; height: number } | undefined {
  const c = layer.content;
  const size = (c.kind === 'image' || c.kind === 'vector') && c.assetId ? assets[c.assetId] : undefined;
  return size && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : undefined;
}

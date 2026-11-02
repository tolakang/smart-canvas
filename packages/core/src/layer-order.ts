/**
 * The layer comp's group order (D45, PDF page 3 "Layer Comp Node"): by default logo always on top, then the
 * headline, then the text, then the pictures, then the background — one group per kind of asset node (D73: Text
 * is its own group, and the pictures' group is named Image like its node); D48: the groups can be dragged into another order
 * (`ProjectDoc.layerOrder`). Every composition's rows (and each output's own rows) are kept in these groups,
 * front to back; within a group the order is the user's. Pure.
 */
import { languagePairs, pairInputs } from './languages';
import type { ProjectDoc } from './model';
import { layerSources, type LayerSource } from './layers';

export type LayerGroup = 'logo' | 'headline' | 'text' | 'elements' | 'background';
export const LAYER_GROUPS: readonly LayerGroup[] = ['logo', 'headline', 'text', 'elements', 'background'];
/** D73: each group is named like the asset node its layers come from (`elements` keeps its stored id). */
export const LAYER_GROUP_LABEL: Record<LayerGroup, string> = { logo: 'Logo', headline: 'Headline', text: 'Text', elements: 'Image', background: 'Background' };

/** The group of a layer: by its behaviour; a Headline card's pictures (D44) are the headline, text layers (D73) the text. */
export function layerGroup(layer: Pick<LayerSource, 'id' | 'behavesLike'>, headlinePictures: ReadonlySet<string> = new Set()): LayerGroup {
  if (layer.behavesLike === 'logo') return 'logo';
  if (headlinePictures.has(layer.id)) return 'headline';
  if (layer.behavesLike === 'text') return 'text';
  if (layer.behavesLike === 'background') return 'background';
  return 'elements';
}

/**
 * D48: the project's group order, front first (every group, each once). D73: an order saved before Text was its own
 * group (the four others) gets Text right behind Headline, where its layers sorted until then.
 */
export function layerOrderOf(doc: Pick<ProjectDoc, 'layerOrder'>): LayerGroup[] {
  const o = doc.layerOrder ?? [];
  if (o.length === LAYER_GROUPS.length && LAYER_GROUPS.every((g) => o.includes(g))) return [...o];
  const old = LAYER_GROUPS.filter((g) => g !== 'text');
  if (o.length === old.length && old.every((g) => o.includes(g))) {
    const at = o.indexOf('headline') + 1;
    return [...o.slice(0, at), 'text', ...o.slice(at)];
  }
  return [...LAYER_GROUPS];
}

/** D48: moves a group to position `to` (front = 0); every composition's rows follow. */
export function moveLayerGroup(doc: ProjectDoc, group: LayerGroup, to: number): ProjectDoc {
  const order = layerOrderOf(doc).filter((g) => g !== group);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, group);
  const next: ProjectDoc = { ...doc };
  if (order.every((g, i) => g === LAYER_GROUPS[i])) delete next.layerOrder;
  else next.layerOrder = order;
  return orderLayers(next);
}

/** Rows sorted into the groups, keeping the user's order within each (stable). */
function sortRows(rows: readonly string[], groupOf: (id: string) => LayerGroup, order: readonly LayerGroup[]): string[] {
  const rank = (id: string) => order.indexOf(groupOf(id));
  return rows.map((id, i) => ({ id, i, r: rank(id) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.id);
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The doc with every composition's and output's rows in group order; `doc` itself when nothing moves. */
export function orderLayers(doc: ProjectDoc): ProjectDoc {
  const headline = new Set(languagePairs(doc).flatMap(pairInputs));
  const byId = new Map(layerSources(doc).map((l) => [l.id, l]));
  const groupOf = (id: string): LayerGroup => {
    const l = byId.get(id);
    return l ? layerGroup(l, headline) : 'elements';
  };
  const order = layerOrderOf(doc);
  let changed = false;
  const compositions = doc.compositions.map((c) => {
    const layers = sortRows(c.layers, groupOf, order);
    if (same(layers, c.layers)) return c;
    changed = true;
    return { ...c, layers };
  });
  return changed ? { ...doc, compositions } : doc;
}

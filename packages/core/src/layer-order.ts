/**
 * The layer comp's group order (D45, PDF page 3 "Layer Comp Node"): by default logo always on top, then the
 * headline, then the elements, then the background; D48: the groups can be dragged into another order
 * (`ProjectDoc.layerOrder`). Every composition's rows (and each output's own rows) are kept in these groups,
 * front to back; within a group the order is the user's. Pure.
 */
import { languagePairs, pairInputs } from './languages';
import type { ProjectDoc } from './model';
import { layerSources, type LayerSource } from './processes';

export type LayerGroup = 'logo' | 'headline' | 'elements' | 'background';
export const LAYER_GROUPS: readonly LayerGroup[] = ['logo', 'headline', 'elements', 'background'];
export const LAYER_GROUP_LABEL: Record<LayerGroup, string> = { logo: 'Logo', headline: 'Headline', elements: 'Elements', background: 'Background' };

/** The group of a layer: by its behaviour; a Headline card's pictures (D44) are the headline. */
export function layerGroup(layer: Pick<LayerSource, 'id' | 'behavesLike'>, headlinePictures: ReadonlySet<string> = new Set()): LayerGroup {
  if (layer.behavesLike === 'logo') return 'logo';
  if (layer.behavesLike === 'text' || headlinePictures.has(layer.id)) return 'headline';
  if (layer.behavesLike === 'background') return 'background';
  return 'elements';
}

/** D48: the project's group order, front first (all four groups, each once). */
export function layerOrderOf(doc: Pick<ProjectDoc, 'layerOrder'>): LayerGroup[] {
  const o = doc.layerOrder ?? [];
  return o.length === LAYER_GROUPS.length && LAYER_GROUPS.every((g) => o.includes(g)) ? [...o] : [...LAYER_GROUPS];
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
  const outputs = doc.outputs.map((o) => {
    if (!o.layers) return o;
    const layers = sortRows(o.layers, groupOf, order);
    if (same(layers, o.layers)) return o;
    changed = true;
    return { ...o, layers };
  });
  return changed ? { ...doc, compositions, outputs } : doc;
}

/**
 * The layer comp's fixed order (D45, PDF page 3 "Layer Comp Node"): logo always on top, then the headline, then
 * the elements, then the background. Every composition's rows (and each output's own rows) are kept in these
 * groups, front to back; within a group the order is the user's. Pure.
 */
import { languagePairs } from './languages';
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

/** Rows sorted into the groups, keeping the user's order within each (stable). */
function sortRows(rows: readonly string[], groupOf: (id: string) => LayerGroup): string[] {
  const rank = (id: string) => LAYER_GROUPS.indexOf(groupOf(id));
  return rows.map((id, i) => ({ id, i, r: rank(id) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.id);
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The doc with every composition's and output's rows in group order; `doc` itself when nothing moves. */
export function orderLayers(doc: ProjectDoc): ProjectDoc {
  const headline = new Set(languagePairs(doc).flatMap((p) => [p.km, p.en]));
  const byId = new Map(layerSources(doc).map((l) => [l.id, l]));
  const groupOf = (id: string): LayerGroup => {
    const l = byId.get(id);
    return l ? layerGroup(l, headline) : 'elements';
  };
  let changed = false;
  const compositions = doc.compositions.map((c) => {
    const layers = sortRows(c.layers, groupOf);
    if (same(layers, c.layers)) return c;
    changed = true;
    return { ...c, layers };
  });
  const outputs = doc.outputs.map((o) => {
    if (!o.layers) return o;
    const layers = sortRows(o.layers, groupOf);
    if (same(layers, o.layers)) return o;
    changed = true;
    return { ...o, layers };
  });
  return changed ? { ...doc, compositions, outputs } : doc;
}

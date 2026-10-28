/**
 * What the Main Comps + Export Group group shows (D49, D66; once Layer Comp + Core preset): the master's layer comp
 * groups (D45/D48) and which layout each output uses (D42/D50). All derived from the doc. Pure.
 */
import { compositionById, outputComposition } from './graph';
import { addGuides, familyOfShape, GUIDE_FAMILIES, layoutOf, masterOf } from './guides';
import { layerGroup, layerOrderOf, type LayerGroup } from './layer-order';
import { languagePairs, pairInputs } from './languages';
import { canvasMetrics, type Composition, type GuideFamily, type ProjectDoc } from './model';
import { layerSources, type LayerSource } from './layers';
import type { SourceResult } from './sources';

/** A composition's rows in their layer comp groups (D45, in the project's order D48), front first; empty groups included. */
export function layerComp(doc: ProjectDoc, compositionId: string): { group: LayerGroup; layers: LayerSource[] }[] {
  const comp = compositionById(doc, compositionId);
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  const headline = new Set(languagePairs(doc).flatMap(pairInputs));
  const rows = (comp?.layers ?? []).flatMap((id) => byId.get(id) ?? []);
  return layerOrderOf(doc).map((group) => ({ group, layers: rows.filter((s) => layerGroup(s, headline) === group) }));
}

/**
 * Core Preset Guide (D42, D50): square, vertical, horizontal — each the composition that holds that shape's layout
 * (the master itself for its own shape, else its guide, if added) and the master's outputs in it: an output is in
 * the section chosen for it, else in the one closest to its shape (an output in a section whose layout isn't added
 * yet follows the closest layout that is).
 */
export function guideRows(doc: ProjectDoc, compositionId: string): { family: GuideFamily; composition: Composition | undefined; outputs: { id: string; label: string; chosen: boolean }[] }[] {
  const master = compositionById(doc, masterOf(doc, compositionId));
  if (!master) return [];
  const mine = doc.outputs.filter((o) => outputComposition(doc, o.id) === master.id);
  return GUIDE_FAMILIES.map((family) => ({
    family,
    composition: layoutOf(doc, master.id, family),
    outputs: mine.filter((o) => (o.layout ?? familyOfShape({ width: canvasMetrics(o).trim.w, height: canvasMetrics(o).trim.h })) === family).map((o) => ({ id: o.id, label: o.label, chosen: !!o.layout })),
  }));
}

/**
 * D50: assigns an output to a layout of its master (null: back to the closest shape). A layout not added yet is
 * added (seeded from the master), so the output follows it at once. `newId` names it.
 */
export function setOutputLayout(doc: ProjectDoc, outputId: string, family: GuideFamily | null, newId: string): SourceResult {
  const out = doc.outputs.find((o) => o.id === outputId);
  const master = outputComposition(doc, outputId);
  if (!out || !master) return { ok: false, error: 'not_found' };
  let next = doc;
  if (family && !layoutOf(doc, master, family)) {
    const r = addGuides(doc, master, { [family]: newId });
    if (!r.ok) return r;
    next = r.doc;
  }
  return {
    ok: true,
    doc: {
      ...next,
      outputs: next.outputs.map((o) => {
        if (o.id !== outputId) return o;
        const { layout: _old, ...rest } = o;
        void _old;
        return family ? { ...rest, layout: family } : rest;
      }),
    },
  };
}

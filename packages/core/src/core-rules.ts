/**
 * Core Rule nodes (D47, PDF page 3 "Core Rule" with "Core Preset Guide" and "Core Auto Layout Guide"): a board
 * node that explains how one master preview adapts — its layer comp groups (D45), its layout guides (D42) and
 * the auto layout rule each layer follows (D38). Only the node (its master and position) is stored; what it
 * shows is derived from the doc. Pure.
 */
import { compositionById, MAIN, outputComposition } from './graph';
import { familyOfShape, GUIDE_FAMILIES, guideFor, guidesOf, masterOf } from './guides';
import { layerGroup, layerOrderOf, type LayerGroup } from './layer-order';
import { languagePairs } from './languages';
import { FILL_TOLERANCE, pinOf, type Pin } from './layout/grid';
import { canvasMetrics, LIMITS, type Composition, type CoreRuleNode, type GuideFamily, type NFrame, type ProjectDoc } from './model';
import { sizeInDesignPx } from './render';
import { layerSources, type LayerSource } from './processes';
import type { SourceResult } from './sources';

/** The Core Rule nodes whose master preview still exists. */
export const coreRules = (doc: ProjectDoc): CoreRuleNode[] => (doc.coreRules ?? []).filter((r) => compositionById(doc, r.composition));

const withRules = (doc: ProjectDoc, rules: CoreRuleNode[]): ProjectDoc => {
  const next = { ...doc };
  if (rules.length) next.coreRules = rules;
  else delete next.coreRules;
  return next;
};

export function addCoreRule(doc: ProjectDoc, spec: { id: string; board: { x: number; y: number }; composition?: string }): SourceResult {
  const composition = spec.composition ?? MAIN;
  if (!compositionById(doc, composition)) return { ok: false, error: 'not_found' };
  if (coreRules(doc).some((r) => r.id === spec.id)) return { ok: false, error: 'invalid' };
  if (coreRules(doc).length >= LIMITS.maxCompositions) return { ok: false, error: 'limit' };
  return { ok: true, doc: withRules(doc, [...coreRules(doc), { id: spec.id, composition, board: { x: Math.round(spec.board.x), y: Math.round(spec.board.y) } }]) };
}

export function setCoreRuleComposition(doc: ProjectDoc, id: string, composition: string): SourceResult {
  if (!compositionById(doc, composition) || !coreRules(doc).some((r) => r.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withRules(doc, coreRules(doc).map((r) => (r.id === id ? { ...r, composition } : r))) };
}

export function deleteCoreRule(doc: ProjectDoc, id: string): SourceResult {
  if (!coreRules(doc).some((r) => r.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withRules(doc, coreRules(doc).filter((r) => r.id !== id)) };
}

/** A composition's rows in their layer comp groups (D45, in the project's order D48), front first; empty groups included. */
export function layerComp(doc: ProjectDoc, compositionId: string): { group: LayerGroup; layers: LayerSource[] }[] {
  const comp = compositionById(doc, compositionId);
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  const headline = new Set(languagePairs(doc).flatMap((p) => [p.km, p.en]));
  const rows = (comp?.layers ?? []).flatMap((id) => byId.get(id) ?? []);
  return layerOrderOf(doc).map((group) => ({ group, layers: rows.filter((s) => layerGroup(s, headline) === group) }));
}

/** The auto layout rule (D38) a layer follows in every output, from its behaviour and its frame on the master. */
export type LayerRule =
  | { kind: 'cover' } // fills the output, scaled proportionally (backgrounds; layers touching all four edges)
  | { kind: 'stretch'; axis: 'x' | 'y' } // edge to edge on one axis: stretches with the grid
  | { kind: 'scale'; pin: { x: Pin; y: Pin }; minimum?: true }; // keeps its grid coordinate, scales proportionally

const fills = (lo: number, size: number) => lo <= FILL_TOLERANCE && lo + size >= 1 - FILL_TOLERANCE;

export function layerRule(source: Pick<LayerSource, 'behavesLike'>, frame: NFrame | undefined): LayerRule {
  if (source.behavesLike === 'background' || !frame) return { kind: 'cover' };
  const fx = fills(frame.x, frame.w);
  const fy = fills(frame.y, frame.h);
  const pin = { x: pinOf(frame.x, frame.w, 1), y: pinOf(frame.y, frame.h, 1) };
  // A logo keeps its proportions (and a minimum size) whatever it touches.
  if (source.behavesLike === 'logo') return { kind: 'scale', pin, minimum: true };
  if (fx && fy) return { kind: 'cover' };
  if (fx !== fy) return { kind: 'stretch', axis: fx ? 'x' : 'y' };
  return { kind: 'scale', pin };
}

const PIN_WORD: Record<'x' | 'y', Record<Pin, string>> = { x: { start: 'left', centre: 'centre', end: 'right' }, y: { start: 'top', centre: 'middle', end: 'bottom' } };

/** The rule in a few words, e.g. "Scales, pinned top left". */
export function layerRuleText(rule: LayerRule): string {
  if (rule.kind === 'cover') return 'Covers the output';
  if (rule.kind === 'stretch') return rule.axis === 'x' ? 'Stretches edge to edge across' : 'Stretches edge to edge down';
  const at = rule.pin.x === 'centre' && rule.pin.y === 'centre' ? 'centre' : `${PIN_WORD.y[rule.pin.y]} ${PIN_WORD.x[rule.pin.x]}`;
  return `Scales, pinned ${at}${rule.minimum ? ' (minimum size)' : ''}`;
}

/**
 * Core Preset Guide (D42) rows for a master preview: square, vertical, horizontal — each the composition that
 * holds that shape's layout (the master itself for its own shape, else its guide, if added) and how many of the
 * master's outputs use it.
 */
export function guideRows(doc: ProjectDoc, compositionId: string): { family: GuideFamily; composition: Composition | undefined; outputs: number }[] {
  const master = compositionById(doc, masterOf(doc, compositionId));
  if (!master) return [];
  const own = familyOfShape(sizeInDesignPx(master.size));
  const guides = guidesOf(doc, master.id);
  const used = new Map<string, number>();
  for (const o of doc.outputs) {
    if (outputComposition(doc, o.id) !== master.id) continue;
    const g = guideFor(doc, master.id, canvasMetrics(o).trim);
    if (g) used.set(g.id, (used.get(g.id) ?? 0) + 1);
  }
  return GUIDE_FAMILIES.map((family) => {
    const composition = family === own ? master : guides.find((g) => g.guide?.family === family);
    return { family, composition, outputs: composition ? (used.get(composition.id) ?? 0) : 0 };
  });
}

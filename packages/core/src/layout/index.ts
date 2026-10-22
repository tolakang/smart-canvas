/**
 * Layout engine v3 (ADAPTATION-RULES, D38: the stretched grid). Pure and deterministic: layout is computed, never
 * stored; only overrides are applied on top.
 */
import { compositionById, MAIN, mainComposition, outputComposition, wiredLayers } from '../graph';
import { canvasMetrics, DEFAULTS, type Frame, type OutputNode, type ProjectDoc } from '../model';
import { sizeInDesignPx, toDesignFrame } from '../render';
import { backgroundFrame } from './background';
import type { RuleContext } from './context';
import { guideFor, withPictureForShape } from '../guides';
import { gridFrame, gridScale } from './grid';
import { logoFrame } from './logo';
import { outputOnlyFrame } from './output-only';
import { wiredOutputLayers } from '../output-layers';
import { layerSources } from '../processes';
import { fitInFrame, type TextJob } from './text';
import { wrapAt } from './text-fit';
import type { LayoutDeps, LayoutItem, LayoutResult, LayoutWarning } from './types';

export * from './types';
export type { RuleContext } from './context';
export { coverFrame } from './background';
export { FILL_TOLERANCE, fillsAxis, gridFrame, gridScale, pinOf, type Pin } from './grid';
export { breakLines, fitText } from './text-fit';

/** `output.family` unless 'auto'; then side when the trim ratio is ≥ 1.3, else stack. */
export function familyOf(output: Pick<OutputNode, 'family'>, trim: { w: number; h: number }): 'stack' | 'side' {
  if (output.family !== 'auto') return output.family;
  return trim.w / trim.h >= DEFAULTS.sideFamilyMinRatio ? 'side' : 'stack';
}

export function computeLayout(doc: ProjectDoc, outputId: string, deps: LayoutDeps): LayoutResult {
  const output = doc.outputs.find((o) => o.id === outputId);
  if (!output) throw new Error(`unknown output ${outputId}`);
  const metrics = canvasMetrics(output);
  const family = familyOf(output, metrics.trim);
  // The output's composition (D32): the one wired to it; a disconnected (frozen) output keeps main's rows.
  const comp = compositionById(doc, outputComposition(doc, outputId) ?? MAIN) ?? mainComposition(doc);
  const masterSize = sizeInDesignPx(comp.size);
  const master = { w: masterSize.width, h: masterSize.height };
  const contextOf = (m: { w: number; h: number }): RuleContext => ({ metrics, family, master: m, k: Math.min(metrics.trim.w / m.w, metrics.trim.h / m.h) });
  const ctx = contextOf(master);
  // D42: positions come from the master's guide closest to this output's shape (the master when it has none);
  // a layer that guide hasn't placed keeps the master's position.
  const guide = guideFor(doc, comp.id, metrics.trim) ?? comp;
  const guideSize = sizeInDesignPx(guide.size);
  const guideCtx = contextOf({ w: guideSize.width, h: guideSize.height });
  const placed = (id: string): { f: Frame; ctx: RuleContext } | undefined => {
    const g = guide.placements[id];
    if (g) return { f: toDesignFrame(g, guideSize), ctx: guideCtx };
    const p = comp.placements[id];
    return p ? { f: toDesignFrame(p, masterSize), ctx } : undefined;
  };
  const wired = wiredLayers(doc, comp.id);
  const overrides = new Map(output.overrides.map((o) => [o.sourceId, o]));
  // Disconnected (D20/D21, O7): frames frozen at disconnect time; content still updates, overrides still apply.
  const frozen = new Map(output.frozen?.items.map((i) => [i.sourceId, i]));

  const layers = layerSources(doc);
  const items: LayoutItem[] = [];
  // D43: each picture input draws its slot for this output's shape (a background's vertical / horizontal picture).
  const byId = new Map(layers.map((s) => [s.id, withPictureForShape(s, metrics.trim)]));
  for (const source of [...comp.layers].reverse().flatMap((id) => byId.get(id) ?? [])) {
    const override = overrides.get(source.id);
    if (!source.visible || !wired.has(source.id) || override?.hidden) continue;
    const snap = frozen.get(source.id);
    if (snap) {
      const frame = { ...snap.frame, ...override?.frame };
      if (source.content.kind === 'text') {
        const style = { ...source.content.style, ...override?.style };
        const size = override?.style?.fontSizePx ?? snap.fontSizePx ?? style.fontSizePx * ctx.k;
        const fit = wrapAt(source.content.text, style, frame, size, deps.measure);
        items.push({ sourceId: source.id, frame, fontSizePx: size, lines: fit.lines, overridden: !!override, warnings: fit.overflow ? ['text-overflow'] : [] });
      } else items.push({ sourceId: source.id, frame, overridden: !!override, warnings: [] });
      continue;
    }
    const at = placed(source.id);
    const f = at?.f;
    const lctx = at?.ctx ?? ctx;
    let frame: Frame;
    let warnings: LayoutWarning[] = [];
    switch (source.behavesLike) {
      case 'background':
        frame = backgroundFrame(source, metrics, deps);
        break;
      case 'subject':
      case 'decoration':
        if (!f) continue;
        frame = gridFrame(f, lctx);
        break;
      case 'logo':
        if (!f) continue;
        ({ frame, warnings } = logoFrame(f, lctx));
        break;
      case 'text': {
        if (!f || source.content.kind !== 'text') continue;
        const style = { ...source.content.style, ...override?.style };
        const job: TextJob = { text: source.content.text, style, master: f, fixedSizePx: override?.style?.fontSizePx, scale: gridScale(f, lctx) };
        // An override frame replaces the box; fit still runs inside it.
        const box = { ...gridFrame(f, lctx), ...override?.frame };
        items.push({ sourceId: source.id, ...fitInFrame(job, box, deps.measure), overridden: !!override });
        continue;
      }
    }
    items.push({
      sourceId: source.id,
      frame: override?.frame ? { ...frame, ...override.frame } : frame,
      overridden: !!override,
      warnings,
    });
  }

  // Output-only layers (T12.4): above the composition's layers, back to front; the composition wins a layer both draw.
  const drawn = new Set(items.map((i) => i.sourceId));
  const ownWired = wiredOutputLayers(doc, outputId);
  for (const source of [...(output.layers ?? [])].reverse().flatMap((id) => byId.get(id) ?? [])) {
    const override = overrides.get(source.id);
    if (!source.visible || !ownWired.has(source.id) || override?.hidden || drawn.has(source.id)) continue;
    const snap = frozen.get(source.id);
    const base = snap?.frame ?? outputOnlyFrame(source, metrics, deps);
    const frame = override?.frame ? { ...base, ...override.frame } : base;
    if (source.content.kind === 'text') {
      const style = { ...source.content.style, ...override?.style };
      const fixed = override?.style?.fontSizePx ?? snap?.fontSizePx;
      const job: TextJob = { text: source.content.text, style, master: frame, fixedSizePx: fixed, scale: ctx.k };
      items.push({ sourceId: source.id, ...fitInFrame(job, frame, deps.measure), overridden: !!override });
    } else items.push({ sourceId: source.id, frame, overridden: !!override, warnings: [] });
  }
  const main = new Map(layers.map((s) => [s.id, s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null]));
  return {
    metrics,
    family,
    items: items.map((it) => {
      const c = byId.get(it.sourceId)?.content;
      const id = c && (c.kind === 'image' || c.kind === 'vector') ? c.assetId : null;
      return id && id !== main.get(it.sourceId) ? { ...it, assetId: id } : it;
    }),
  };
}

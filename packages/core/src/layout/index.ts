/**
 * Layout engine v2 (ADAPTATION-RULES, D30: content fit). Pure and deterministic: layout is computed, never
 * stored; only overrides are applied on top.
 */
import { compositionById, MAIN, mainComposition, outputComposition, wiredLayers } from '../graph';
import { canvasMetrics, DEFAULTS, type Frame, type OutputNode, type ProjectDoc } from '../model';
import { sizeInDesignPx, toDesignFrame } from '../render';
import { backgroundFrame } from './background';
import { groupMap, regions, type GroupMap } from './content';
import type { RuleContext } from './context';
import { logoFrame } from './logo';
import { outputOnlyFrame } from './output-only';
import { wiredOutputLayers } from '../output-layers';
import { layerSources } from '../processes';
import { decorationFrame, subjectFrame } from './subject';
import { fitInFrame, sideColumn, stackTextFrame, type TextJob } from './text';
import { wrapAt } from './text-fit';
import type { LayoutDeps, LayoutItem, LayoutResult, LayoutWarning } from './types';

export * from './types';
export type { RuleContext } from './context';
export { coverFrame } from './background';
export { anchoredFrame, clampIntoSafe } from './subject';
export { groupMap, mappedFrame, unionOf, type GroupMap } from './content';
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
  const ctx: RuleContext = { metrics, family, master, k: Math.min(metrics.trim.w / master.w, metrics.trim.h / master.h) };
  const wired = wiredLayers(doc, comp.id);
  const overrides = new Map(output.overrides.map((o) => [o.sourceId, o]));
  // Disconnected (D20/D21, O7): frames frozen at disconnect time; content still updates, overrides still apply.
  const frozen = new Map(output.frozen?.items.map((i) => [i.sourceId, i]));

  // Content groups (v2): the master frames of the layers that carry the design, fitted together.
  const layers = layerSources(doc);
  const visible = layers.filter((s) => s.visible && wired.has(s.id) && !overrides.get(s.id)?.hidden && !frozen.has(s.id));
  const masterFrame = (id: string) => {
    const p = comp.placements[id];
    return p ? toDesignFrame(p, masterSize) : undefined;
  };
  const framesOf = (pick: (b: string) => boolean) =>
    visible.filter((s) => pick(s.behavesLike) && (s.behavesLike !== 'text' || s.content.kind === 'text')).flatMap((s) => masterFrame(s.id) ?? []);
  const visualFrames = framesOf((b) => b === 'subject' || b === 'decoration');
  const textFrames = framesOf((b) => b === 'text');
  const region = regions(ctx, visualFrames.length > 0, textFrames.length > 0);
  const all = groupMap([...visualFrames, ...textFrames], metrics.safe, ctx);
  const groupFor: Record<'visuals' | 'text', GroupMap | null> =
    family === 'stack'
      ? { visuals: all, text: all }
      : { visuals: groupMap(visualFrames, region.visuals, ctx), text: groupMap(textFrames, region.text, ctx) };
  const fallback = (R: typeof metrics.safe): GroupMap => ({ c: ctx.k, px: ctx.k, py: ctx.k, U: { x: 0, y: 0, w: master.w, h: master.h }, R });

  const items: LayoutItem[] = [];
  const column: { index: number; job: TextJob }[] = []; // side-family texts, placed together after the loop
  const byId = new Map(layers.map((s) => [s.id, s]));
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
    const placement = comp.placements[source.id];
    const f = placement ? toDesignFrame(placement, masterSize) : undefined;
    let frame: Frame;
    let warnings: LayoutWarning[] = [];
    switch (source.behavesLike) {
      case 'background':
        frame = backgroundFrame(source, metrics, deps);
        break;
      case 'subject':
        if (!f) continue;
        ({ frame, warnings } = subjectFrame(f, groupFor.visuals ?? fallback(region.visuals), ctx));
        break;
      case 'decoration':
        if (!f) continue;
        frame = decorationFrame(f, groupFor.visuals ?? fallback(region.visuals));
        break;
      case 'logo':
        if (!f) continue;
        ({ frame, warnings } = logoFrame(f, ctx));
        break;
      case 'text': {
        if (!f || source.content.kind !== 'text') continue;
        const style = { ...source.content.style, ...override?.style };
        const g = groupFor.text ?? fallback(region.text);
        const job: TextJob = { text: source.content.text, style, master: f, fixedSizePx: override?.style?.fontSizePx, scale: g.c };
        if (override?.frame) {
          // Override frame: fit still runs inside it (rule 8).
          const placed = fitInFrame(job, { ...stackTextFrame(f, g, ctx).frame, ...override.frame }, deps.measure);
          items.push({ sourceId: source.id, ...placed, overridden: true });
        } else if (family === 'side') {
          column.push({ index: items.length, job });
          items.push({ sourceId: source.id, frame: f, overridden: !!override, warnings: [] });
        } else {
          const box = stackTextFrame(f, g, ctx);
          items.push({ sourceId: source.id, ...fitInFrame(job, box.frame, deps.measure, box.warnings), overridden: !!override });
        }
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
  const placed = sideColumn(column.map((c) => c.job), ctx, deps.measure, region.text);
  column.forEach((c, i) => {
    const item = items[c.index];
    const p = placed[i];
    if (item && p) items[c.index] = { ...item, ...p };
  });

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
  return { metrics, family, items };
}

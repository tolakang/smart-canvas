/**
 * Layout engine v1 (ADAPTATION-RULES). Pure and deterministic: layout is computed, never stored;
 * only overrides are applied on top.
 */
import { canvasMetrics, DEFAULTS, type Frame, type OutputNode, type ProjectDoc } from '../model';
import { sizeInDesignPx, toDesignFrame } from '../render';
import { backgroundFrame } from './background';
import type { RuleContext } from './context';
import { logoFrame } from './logo';
import { decorationFrame, subjectFrame } from './subject';
import { fitInFrame, stackTextFrame, type TextJob } from './text';
import type { LayoutDeps, LayoutItem, LayoutResult, LayoutWarning } from './types';

export * from './types';
export type { RuleContext } from './context';
export { coverFrame } from './background';
export { anchoredFrame, clampIntoSafe } from './subject';
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
  const masterSize = sizeInDesignPx(doc.master.size);
  const master = { w: masterSize.width, h: masterSize.height };
  const ctx: RuleContext = { metrics, family, master, k: Math.min(metrics.trim.w / master.w, metrics.trim.h / master.h) };
  const wired = new Set(doc.wires.filter((w) => w.to === 'main').map((w) => w.from));
  const overrides = new Map(output.overrides.map((o) => [o.sourceId, o]));

  const items: LayoutItem[] = [];
  for (const source of [...doc.sources].sort((a, b) => b.port - a.port)) {
    const override = overrides.get(source.id);
    if (!source.visible || !wired.has(source.id) || override?.hidden) continue;
    const placement = doc.master.placements[source.id];
    const f = placement ? toDesignFrame(placement, masterSize) : undefined;
    let frame: Frame;
    let warnings: LayoutWarning[] = [];
    switch (source.behavesLike) {
      case 'background':
        frame = backgroundFrame(source, metrics, deps);
        break;
      case 'subject':
        if (!f) continue;
        ({ frame, warnings } = subjectFrame(f, ctx));
        break;
      case 'decoration':
        if (!f) continue;
        frame = decorationFrame(f, ctx);
        break;
      case 'logo':
        if (!f) continue;
        ({ frame, warnings } = logoFrame(f, ctx));
        break;
      case 'text': {
        if (!f || source.content.kind !== 'text') continue;
        const style = { ...source.content.style, ...override?.style };
        const job: TextJob = { text: source.content.text, style, master: f, fixedSizePx: override?.style?.fontSizePx };
        if (override?.frame) {
          // Override frame: fit still runs inside it (rule 8).
          const placed = fitInFrame(job, { ...stackTextFrame(f, ctx).frame, ...override.frame }, ctx, deps.measure);
          items.push({ sourceId: source.id, ...placed, overridden: true });
        } else {
          const box = stackTextFrame(f, ctx);
          items.push({ sourceId: source.id, ...fitInFrame(job, box.frame, ctx, deps.measure, box.warnings), overridden: !!override });
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
  return { metrics, family, items };
}

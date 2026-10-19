/**
 * Layout engine v1 (ADAPTATION-RULES). Pure and deterministic: layout is computed, never stored;
 * only overrides are applied on top.
 */
import { canvasMetrics, DEFAULTS, type Frame, type OutputNode, type ProjectDoc } from '../model';
import { backgroundFrame } from './background';
import type { LayoutDeps, LayoutItem, LayoutResult } from './types';

export * from './types';
export { coverFrame } from './background';

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
  const wired = new Set(doc.wires.filter((w) => w.to === 'main').map((w) => w.from));
  const overrides = new Map(output.overrides.map((o) => [o.sourceId, o]));

  const items: LayoutItem[] = [];
  for (const source of [...doc.sources].sort((a, b) => b.port - a.port)) {
    const override = overrides.get(source.id);
    if (!source.visible || !wired.has(source.id) || override?.hidden) continue;
    let frame: Frame;
    switch (source.behavesLike) {
      case 'background':
        frame = backgroundFrame(source, metrics, deps);
        break;
      default:
        continue; // subject, decoration, logo, text: T4.3–T4.5
    }
    items.push({
      sourceId: source.id,
      frame: override?.frame ? { ...frame, ...override.frame } : frame,
      overridden: !!override,
      warnings: [],
    });
  }
  return { metrics, family, items };
}

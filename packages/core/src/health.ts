/**
 * Layout health (D35): how a node's layout is doing, for the status dot on the board and the issue list.
 * - error: something can't be drawn as designed (a text font that failed to load);
 * - warning: the engine had to compromise (text overflow, logo raised to its minimum, a layer clamped into
 *   the safe area);
 * - empty (D64, amends D35): the only thing to report is wired layers with no file or text yet — a to-do on a
 *   new project, not a problem, so it shows grey with the count, not amber;
 * - frozen: a disconnected output (its layout no longer follows the master preview);
 * - ok: nothing to report.
 * Export progress is not health; it stays in the export dialog.
 */
import { compositionById, MAIN, outputComposition, wiredLayers } from './graph';
import { layerSources } from './layers';
import type { LayoutResult, LayoutWarning } from './layout';
import type { InputSource, ProjectDoc } from './model';

export type HealthLevel = 'ok' | 'empty' | 'warning' | 'error' | 'frozen';
export type HealthCode = LayoutWarning | 'empty' | 'font-missing';

export interface HealthIssue {
  sourceId: string;
  label: string;
  code: HealthCode;
  /** 'todo': a wired layer still empty (D64). */
  level: 'todo' | 'warning' | 'error';
  message: string;
}

export interface Health {
  level: HealthLevel;
  issues: HealthIssue[];
}

const MESSAGE: Record<HealthCode, string> = {
  'text-overflow': 'Text does not fit, even at the smallest size',
  'min-logo': 'Logo raised to its minimum size',
  clamped: 'Moved inside the safe area',
  empty: 'No file or text yet',
  'font-missing': 'Font could not be loaded',
};

/** A layer with nothing to draw yet: a picture with no file, or a text with no words. The health count, the Export
 * note (B9) and the editors' "empty" tag (B5) all use this one test. */
export function isEmptyLayer(s: InputSource): boolean {
  const c = s.content;
  return c.kind === 'image' || c.kind === 'vector' ? !c.assetId : c.kind === 'text' ? !c.text.trim() : false;
}

/** Wired, visible layers of a composition that have nothing to draw yet. */
function emptyIssues(doc: ProjectDoc, compositionId: string): HealthIssue[] {
  const comp = compositionById(doc, compositionId);
  if (!comp) return [];
  const wired = wiredLayers(doc, comp.id);
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  return comp.layers.flatMap((id) => {
    const s = byId.get(id);
    return s && s.visible && wired.has(id) && isEmptyLayer(s) ? [issue(s, 'empty')] : [];
  });
}

function issue(s: Pick<InputSource, 'id' | 'label'>, code: HealthCode): HealthIssue {
  return { sourceId: s.id, label: s.label, code, level: code === 'font-missing' ? 'error' : code === 'empty' ? 'todo' : 'warning', message: MESSAGE[code] };
}

function levelOf(issues: HealthIssue[], frozen = false): HealthLevel {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warning')) return 'warning';
  if (frozen) return 'frozen';
  return issues.length ? 'empty' : 'ok';
}

/** Text sources whose font family is in `missingFonts`. */
function fontIssues(doc: ProjectDoc, ids: Set<string>, missingFonts: readonly string[]): HealthIssue[] {
  if (missingFonts.length === 0) return [];
  return layerSources(doc).flatMap((s) => (ids.has(s.id) && s.content.kind === 'text' && missingFonts.includes(s.content.style.fontFamily) ? [issue(s, 'font-missing')] : []));
}

/** Health of a composition (default: the master preview): empty wired layers and missing fonts. */
export function compositionHealth(doc: ProjectDoc, compositionId: string = MAIN, missingFonts: readonly string[] = []): Health {
  const issues = [...fontIssues(doc, wiredLayers(doc, compositionId), missingFonts), ...emptyIssues(doc, compositionId)];
  return { level: levelOf(issues), issues };
}

/** Health of an output from its computed layout: engine warnings per drawn layer, empty layers, missing fonts. */
export function outputHealth(doc: ProjectDoc, outputId: string, layout: LayoutResult, missingFonts: readonly string[] = []): Health {
  const byId = new Map(layerSources(doc).map((s) => [s.id, s]));
  const drawn = new Set(layout.items.map((i) => i.sourceId));
  const issues: HealthIssue[] = [...fontIssues(doc, drawn, missingFonts)];
  for (const item of layout.items) {
    const s = byId.get(item.sourceId);
    if (!s) continue;
    for (const w of new Set(item.warnings)) issues.push(issue(s, w));
  }
  const connected = outputComposition(doc, outputId);
  issues.push(...emptyIssues(doc, connected ?? MAIN));
  return { level: levelOf(issues, !connected), issues };
}

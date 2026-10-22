/**
 * The Delete / Backspace key on the board: what the selected nodes are, in words for the confirm, and the
 * doc without them. Inputs, Assets cards (with their pictures), Preset nodes (with their sizes), processes, extra master previews and outputs are deleted (as their own delete
 * buttons do); a group frame is ungrouped (its nodes stay); the first master preview can't be deleted.
 */
import { assetStacks, deleteComposition, deletePair, languagePairs, deleteOutput, deletePresetSet, presetSets, coreRules, deleteCoreRule, deleteProcess, deleteSource, deleteStack, MAIN, ungroup, type LayoutDeps, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { compositionIdOfNode, groupIdOfNode, outputIdOfNode, processIdOfNode, pairIdOfNode, setIdOfNode, ruleIdOfNode, sourceIdOfNode, stackIdOfNode } from './flow';

type Target = { kind: 'input' | 'stack' | 'headline' | 'preset' | 'rule' | 'process' | 'composition' | 'output' | 'group'; id: string; label: string };

/** The deletable nodes among `nodeIds`, with their labels. */
export function deletableNodes(doc: ProjectDoc, nodeIds: readonly string[]): Target[] {
  const out: Target[] = [];
  for (const n of nodeIds) {
    const src = sourceIdOfNode(n);
    const proc = processIdOfNode(n);
    const grp = groupIdOfNode(n);
    const outp = outputIdOfNode(n);
    const comp = compositionIdOfNode(n);
    const stk = stackIdOfNode(n);
    const hl = pairIdOfNode(n);
    const set = setIdOfNode(n);
    const rule = ruleIdOfNode(n);
    if (rule) {
      if (coreRules(doc).some((x) => x.id === rule)) out.push({ kind: 'rule', id: rule, label: 'Core rules' });
    } else if (set) {
      const s = presetSets(doc).find((x) => x.id === set);
      if (s) out.push({ kind: 'preset', id: set, label: s.label });
    } else if (hl) {
      const p = languagePairs(doc).find((x) => x.id === hl);
      if (p) out.push({ kind: 'headline', id: hl, label: p.label });
    } else if (stk) {
      const st = assetStacks(doc).find((x) => x.id === stk);
      if (st) out.push({ kind: 'stack', id: stk, label: st.label });
    } else if (src) {
      const s = doc.sources.find((x) => x.id === src);
      if (s) out.push({ kind: 'input', id: src, label: s.label });
    } else if (proc) {
      const p = doc.processes.find((x) => x.id === proc);
      if (p) out.push({ kind: 'process', id: proc, label: p.label });
    } else if (grp) {
      const g = doc.groups?.find((x) => x.id === grp);
      if (g) out.push({ kind: 'group', id: grp, label: g.label });
    } else if (outp) {
      const o = doc.outputs.find((x) => x.id === outp);
      if (o) out.push({ kind: 'output', id: outp, label: o.label });
    } else if (comp && comp !== MAIN) {
      const c = doc.compositions.find((x) => x.id === comp);
      if (c) out.push({ kind: 'composition', id: comp, label: c.label });
    }
  }
  return out;
}

/** One confirm question for the whole selection. */
export function deleteQuestion(targets: readonly Target[]): string {
  const groups = targets.filter((t) => t.kind === 'group');
  const rest = targets.filter((t) => t.kind !== 'group');
  const names = (ts: readonly Target[]) => (ts.length === 1 ? `“${ts[0]?.label}”` : `${ts.length} nodes`);
  const parts = [rest.length ? `Delete ${names(rest)}? Their wires and output overrides go with them.` : '', groups.length ? `Ungroup ${names(groups)} (the nodes stay).` : ''];
  return parts.filter(Boolean).join(' ');
}

/** The doc without the targets (each deleted as its own button would; one undo step for the caller). */
export function deleteNodes(doc: ProjectDoc, targets: readonly Target[], deps?: LayoutDeps): SourceResult {
  let next = doc;
  for (const t of targets) {
    const r =
      t.kind === 'input' ? deleteSource(next, t.id)
      : t.kind === 'stack' ? deleteStack(next, t.id)
      : t.kind === 'headline' ? deletePair(next, t.id)
      : t.kind === 'preset' ? deletePresetSet(next, t.id)
      : t.kind === 'rule' ? deleteCoreRule(next, t.id)
      : t.kind === 'process' ? deleteProcess(next, t.id)
      : t.kind === 'output' ? deleteOutput(next, t.id)
      : t.kind === 'group' ? ungroup(next, t.id)
      : deleteComposition(next, t.id, deps);
    // Something already gone with an earlier one (a process fed by a deleted input): skip it.
    if (r.ok) next = r.doc;
  }
  return next === doc ? { ok: false, error: 'not_found' } : { ok: true, doc: next };
}

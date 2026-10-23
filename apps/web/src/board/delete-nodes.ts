/**
 * The Delete / Backspace key on the board: what the selected nodes are, in words for the confirm, and the
 * doc without them. Inputs, asset nodes (with their items), Headline nodes, Preset nodes (with their sizes) and
 * Previews are deleted (as their own delete buttons do); a group frame is ungrouped (its nodes stay); the Layer
 * Comp group can't be deleted (D49).
 */
import { assetStacks, deletePair, languagePairs, deleteOutput, deletePresetSet, presetSets, deleteSource, deleteStack, ungroup, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { groupIdOfNode, outputIdOfNode, pairIdOfNode, setIdOfNode, sourceIdOfNode, stackIdOfNode } from './flow';

type Target = { kind: 'input' | 'stack' | 'headline' | 'preset' | 'output' | 'group'; id: string; label: string };

/** The deletable nodes among `nodeIds`, with their labels. */
export function deletableNodes(doc: ProjectDoc, nodeIds: readonly string[]): Target[] {
  const out: Target[] = [];
  for (const n of nodeIds) {
    const src = sourceIdOfNode(n);
    const grp = groupIdOfNode(n);
    const outp = outputIdOfNode(n);
    const stk = stackIdOfNode(n);
    const hl = pairIdOfNode(n);
    const set = setIdOfNode(n);
    if (set) {
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
    } else if (grp) {
      const g = doc.groups?.find((x) => x.id === grp);
      if (g) out.push({ kind: 'group', id: grp, label: g.label });
    } else if (outp) {
      const o = doc.outputs.find((x) => x.id === outp);
      if (o) out.push({ kind: 'output', id: outp, label: o.label });
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
export function deleteNodes(doc: ProjectDoc, targets: readonly Target[]): SourceResult {
  let next = doc;
  for (const t of targets) {
    const r =
      t.kind === 'input' ? deleteSource(next, t.id)
      : t.kind === 'stack' ? deleteStack(next, t.id)
      : t.kind === 'headline' ? deletePair(next, t.id)
      : t.kind === 'preset' ? deletePresetSet(next, t.id)
      : t.kind === 'output' ? deleteOutput(next, t.id)
      : ungroup(next, t.id);
    // Something already gone with an earlier one (a Preview with its Preset node): skip it.
    if (r.ok) next = r.doc;
  }
  return next === doc ? { ok: false, error: 'not_found' } : { ok: true, doc: next };
}

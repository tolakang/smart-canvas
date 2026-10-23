/**
 * Board groups (T13.7): a named, coloured frame around some nodes, collapsible, with "export the outputs in
 * it". Groups only organise the board: they never change a layout. A group's box is computed from its nodes'
 * positions on the board; only its members, name, colour and collapsed state are stored. Members that no
 * longer exist are ignored (and dropped on the next edit); a group left with no members goes.
 */
import { LIMITS, type BoardGroup, type GroupColor, type ProjectDoc } from './model';
import type { SourceResult } from './sources';

export const GROUP_COLORS: readonly GroupColor[] = ['grey', 'blue', 'purple', 'green', 'orange', 'red'];

/** What a group can hold: any board node — inputs, asset and Headline nodes (D40, D44), Preset nodes (D46), the master, Previews. */
const exists = (doc: ProjectDoc) => {
  const ids = new Set([
    ...doc.sources.map((s) => s.id),
    ...doc.compositions.map((c) => c.id),
    ...doc.outputs.map((o) => o.id),
    ...(doc.stacks ?? []).map((s) => s.id),
    ...(doc.headlines ?? []).map((h) => h.id),
    ...(doc.presetSets ?? []).map((s) => s.id),
  ]);
  return (id: string) => ids.has(id);
};

/** The groups with only members that still exist (empty ones left out). */
export function boardGroups(doc: ProjectDoc): BoardGroup[] {
  const has = exists(doc);
  return (doc.groups ?? []).flatMap((g) => {
    const nodes = g.nodes.filter(has);
    return nodes.length ? [{ ...g, nodes }] : [];
  });
}

/** The group a node is in, if any. */
export function groupOf(doc: ProjectDoc, nodeId: string): BoardGroup | undefined {
  return boardGroups(doc).find((g) => g.nodes.includes(nodeId));
}

const withGroups = (doc: ProjectDoc, groups: BoardGroup[]): ProjectDoc => {
  const next = { ...doc };
  if (groups.length) next.groups = groups;
  else delete next.groups;
  return next;
};

/** Groups `nodes` (at least one existing node). A node is in one group at most: it leaves its old one. */
export function createGroup(doc: ProjectDoc, spec: { id: string; label: string; nodes: string[]; color?: GroupColor }): SourceResult {
  const has = exists(doc);
  const nodes = [...new Set(spec.nodes)].filter(has);
  if (nodes.length === 0 || has(spec.id) || (doc.groups ?? []).some((g) => g.id === spec.id)) return { ok: false, error: 'invalid' };
  const others = boardGroups(doc).flatMap((g) => {
    const rest = g.nodes.filter((n) => !nodes.includes(n));
    return rest.length ? [{ ...g, nodes: rest }] : [];
  });
  if (others.length >= LIMITS.maxGroups) return { ok: false, error: 'limit' };
  const used = new Set(others.map((g) => g.color));
  const color = spec.color ?? GROUP_COLORS.find((c) => c !== 'grey' && !used.has(c)) ?? 'blue';
  return { ok: true, doc: withGroups(doc, [...others, { id: spec.id, label: spec.label.trim() || 'Group', color, nodes }]) };
}

export function updateGroup(doc: ProjectDoc, id: string, patch: { label?: string; color?: GroupColor; collapsed?: boolean }): SourceResult {
  const groups = boardGroups(doc);
  if (!groups.some((g) => g.id === id)) return { ok: false, error: 'not_found' };
  if (patch.color && !GROUP_COLORS.includes(patch.color)) return { ok: false, error: 'invalid' };
  const label = patch.label?.trim();
  return {
    ok: true,
    doc: withGroups(
      doc,
      groups.map((g) => {
        if (g.id !== id) return g;
        const next: BoardGroup = { ...g, ...(label ? { label } : {}), ...(patch.color ? { color: patch.color } : {}) };
        if (patch.collapsed === true) next.collapsed = true;
        if (patch.collapsed === false) delete next.collapsed;
        return next;
      }),
    ),
  };
}

/** Removes the frame; its nodes stay where they are. */
export function ungroup(doc: ProjectDoc, id: string): SourceResult {
  const groups = boardGroups(doc);
  if (!groups.some((g) => g.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, doc: withGroups(doc, groups.filter((g) => g.id !== id)) };
}

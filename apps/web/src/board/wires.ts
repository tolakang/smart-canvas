/**
 * Wire polish (T13.8), pure helpers for the board:
 * - related: with nodes or wires selected, the wires touching them stay bright and the rest dim;
 * - changed / downstream: when an edit changes a node (not just moves it), the wires carrying that change
 *   downstream pulse once;
 * - reroute points: a wire drawn through its points, and where a new point goes in the list.
 */
import type { ProjectDoc } from '@smart-canvas/core';

type XY = { x: number; y: number };

/** Wires touching a selected node, plus the selected wires (empty selection: none). */
export function relatedEdges(edges: readonly { id: string; source: string; target: string }[], selectedNodes: ReadonlySet<string>, selectedEdges: ReadonlySet<string>): Set<string> {
  return new Set(edges.filter((e) => selectedEdges.has(e.id) || selectedNodes.has(e.source) || selectedNodes.has(e.target)).map((e) => e.id));
}

/** Nodes whose content changed between two docs (inputs, compositions, outputs); moves don't count. */
export function changedNodes(prev: ProjectDoc, next: ProjectDoc): Set<string> {
  const changed = new Set<string>();
  const strip = (x: { board?: unknown }) => {
    const { board: _b, ...rest } = x as Record<string, unknown>;
    void _b;
    return JSON.stringify(rest);
  };
  const compare = <T extends { id: string; board?: unknown }>(a: readonly T[], b: readonly T[]) => {
    const before = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const old = before.get(x.id);
      if (old && old !== x && strip(old) !== strip(x)) changed.add(x.id);
    }
  };
  compare(prev.sources, next.sources);
  compare(prev.compositions, next.compositions);
  compare(prev.outputs, next.outputs);
  return changed;
}

/** The wires a change flows along: every edge reachable downstream from the changed nodes. */
export function downstreamEdges(doc: ProjectDoc, changed: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const seen = new Set(changed);
  const queue = [...changed];
  while (queue.length) {
    const n = queue.shift() as string;
    for (const e of doc.edges) {
      if (e.from !== n) continue;
      out.add(e.id);
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return out;
}

/** A wire from `a` to `b` through `points`: horizontal-tangent curves between each pair (as the plain wire). */
export function routePath(a: XY, b: XY, points: readonly XY[]): string {
  const all = [a, ...points, b];
  let d = `M ${a.x},${a.y}`;
  for (let i = 1; i < all.length; i++) {
    const p = all[i - 1] as XY;
    const q = all[i] as XY;
    const dx = Math.max(30, Math.abs(q.x - p.x) / 2);
    d += ` C ${p.x + dx},${p.y} ${q.x - dx},${q.y} ${q.x},${q.y}`;
  }
  return d;
}

const dist = (p: XY, q: XY) => Math.hypot(p.x - q.x, p.y - q.y);

/** Where a new point `p` goes in `points` (between `a` and `b`): the spot that lengthens the wire least. */
export function insertIndex(a: XY, b: XY, points: readonly XY[], p: XY): number {
  const all = [a, ...points, b];
  let best = 0;
  let cost = Infinity;
  for (let i = 1; i < all.length; i++) {
    const u = all[i - 1] as XY;
    const v = all[i] as XY;
    const extra = dist(u, p) + dist(p, v) - dist(u, v);
    if (extra < cost) {
      cost = extra;
      best = i - 1;
    }
  }
  return best;
}

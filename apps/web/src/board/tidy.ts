/**
 * N4: where nodes go on the board. `clearSpot` finds the nearest place for a new block (a Preset node with its
 * Previews) that overlaps nothing; `tidyPositions` lays the whole board out the page-3 way — asset nodes in a row
 * on top, the Main Comps group under them, the Preset nodes in a column under the group, each with its Previews
 * in a grid of up to three columns to its right (D69). Pure: works on node boxes, returns positions.
 */
import { PREVIEW_GRID, PREVIEW_OFFSET, presetSets, type ProjectDoc } from '@smart-canvas/core';
import { MAIN_ID, compositionNodeId, outputNodeId, setNodeId } from './flow';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The gap kept between blocks. */
export const GAP = 40;

/** Sizes used for nodes React Flow hasn't measured yet. */
export const DEFAULT_SIZE = { w: 300, h: 360 };

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * The free spot nearest to `at` for a block of `size`: `at` itself when nothing is in the way, else the closest
 * of the places just right of or just below the boxes in the way (there is always one: right of everything).
 */
export function clearSpot(occupied: readonly Box[], size: { w: number; h: number }, at: { x: number; y: number }, gap = GAP): { x: number; y: number } {
  const free = (x: number, y: number) => !occupied.some((b) => overlaps({ x, y, w: size.w, h: size.h }, b, gap));
  if (free(at.x, at.y)) return { x: Math.round(at.x), y: Math.round(at.y) };
  const xs = [at.x, ...occupied.map((b) => b.x + b.w + gap)];
  const ys = [at.y, ...occupied.map((b) => b.y + b.h + gap)];
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const x of xs)
    for (const y of ys) {
      if (x < at.x || y < at.y || !free(x, y)) continue;
      const d = (x - at.x) ** 2 + (y - at.y) ** 2;
      if (d < bestD) [best, bestD] = [{ x, y }, d];
    }
  return best ? { x: Math.round(best.x), y: Math.round(best.y) } : { x: Math.round(Math.max(...xs)), y: Math.round(at.y) };
}

/** The block a Preset node of `rows` sizes takes: the node plus its grid of Previews to the right (D69). */
export const presetBlock = (rows: number): { w: number; h: number } => {
  const cols = Math.max(1, Math.min(rows, PREVIEW_GRID.cols));
  return { w: PREVIEW_OFFSET.x + (cols - 1) * PREVIEW_GRID.colGap + DEFAULT_SIZE.w, h: Math.max(DEFAULT_SIZE.h, Math.ceil(Math.max(rows, 1) / PREVIEW_GRID.cols) * PREVIEW_OFFSET.rowGap) };
};

export interface BoardBox {
  id: string;
  type?: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  hidden?: boolean;
}

export const boxOf = (n: BoardBox): Box => ({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? DEFAULT_SIZE.w, h: n.measured?.height ?? DEFAULT_SIZE.h });

const ASSET_TYPES = new Set(['assetsNode', 'textNode', 'headlineNode', 'inputNode']);

/**
 * N4 "Tidy board": new positions for every node (React Flow node ids). Asset nodes keep their left-to-right order,
 * Preset nodes their top-to-bottom order; a Preset node's Previews follow its row order. Nodes of other kinds
 * stay where they are.
 */
export function tidyPositions(doc: ProjectDoc, nodes: readonly BoardBox[]): { id: string; position: { x: number; y: number } }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: { id: string; position: { x: number; y: number } }[] = [];
  const assets = nodes.filter((n) => n.type && ASSET_TYPES.has(n.type)).sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const group = byId.get(compositionNodeId(MAIN_ID));
  const anchor = [...assets, ...(group ? [group] : [])];
  // The board keeps its top-left corner.
  const left = anchor.length ? Math.min(...anchor.map((n) => n.position.x)) : 0;
  const top = anchor.length ? Math.min(...anchor.map((n) => n.position.y)) : 0;

  let x = left;
  let rowBottom = top;
  for (const n of assets) {
    const b = boxOf(n);
    out.push({ id: n.id, position: { x, y: top } });
    x += b.w + GAP;
    rowBottom = Math.max(rowBottom, top + b.h);
  }

  let y = assets.length ? rowBottom + GAP * 3 : top;
  if (group) {
    out.push({ id: group.id, position: { x: left, y } });
    y += boxOf(group).h + GAP * 3;
  }

  const sets = presetSets(doc)
    .map((s) => ({ set: s, node: byId.get(setNodeId(s.id)) }))
    .filter((s): s is { set: (typeof s)['set']; node: BoardBox } => !!s.node)
    .sort((a, b) => a.node.position.y - b.node.position.y || a.node.position.x - b.node.position.x);
  for (const { set, node } of sets) {
    out.push({ id: node.id, position: { x: left, y } });
    // D69: its Previews row by row in up to three columns, each column as wide as its widest Preview, each row as
    // tall as its tallest.
    const previews = set.outputs.flatMap((o) => byId.get(outputNodeId(o)) ?? []).filter((p) => !p.hidden);
    const cols = Math.min(PREVIEW_GRID.cols, previews.length);
    const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...previews.filter((_, i) => i % cols === c).map((p) => boxOf(p).w)));
    let py = y;
    for (let r = 0; r * cols < previews.length; r++) {
      const row = previews.slice(r * cols, r * cols + cols);
      let px = left + PREVIEW_OFFSET.x;
      row.forEach((p, c) => {
        out.push({ id: p.id, position: { x: px, y: py } });
        px += (colW[c] ?? 0) + GAP;
      });
      py += Math.max(...row.map((p) => boxOf(p).h)) + GAP;
    }
    y = Math.max(y + boxOf(node).h, py) + GAP * 2;
  }
  return out.map((m) => ({ id: m.id, position: { x: Math.round(m.position.x), y: Math.round(m.position.y) } }));
}

/** Rounds a position to the board grid (`step` px) when grid snap is on. */
export const onGrid = (p: { x: number; y: number }, step: number): { x: number; y: number } => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step });

/**
 * D57 "Tidy selection": the selected panels in an even grid, in reading order (top to bottom, then left to right;
 * panels whose tops are within half a panel of each other count as one row), starting where the selection's
 * top-left corner was. About as many columns as rows; each row is as tall as its tallest panel, each column as wide
 * as its widest; GAP between them.
 */
export function tidySelectionPositions(nodes: readonly BoardBox[]): { id: string; position: { x: number; y: number } }[] {
  const boxes = nodes.filter((n) => !n.hidden).map((n) => ({ id: n.id, ...boxOf(n) }));
  if (boxes.length < 2) return [];
  const rowTol = Math.min(...boxes.map((b) => b.h)) / 2;
  const sorted = [...boxes].sort((a, b) => (Math.abs(a.y - b.y) <= rowTol ? a.x - b.x : a.y - b.y));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...sorted.filter((_, i) => i % cols === c).map((b) => b.w)));
  const rows = Math.ceil(sorted.length / cols);
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...sorted.slice(r * cols, r * cols + cols).map((b) => b.h)));
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  return sorted.map((b, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = x0 + colW.slice(0, c).reduce((s, w) => s + w + GAP, 0);
    const y = y0 + rowH.slice(0, r).reduce((s, h) => s + h + GAP, 0);
    return { id: b.id, position: { x: Math.round(x), y: Math.round(y) } };
  });
}


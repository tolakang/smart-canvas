/**
 * The board graph (D32, D56): compositions, typed edges, and the migrations (v1 → v2 → v3).
 * - A composition's `layers` are its rows, front first; row index = port (D11). A row draws while a `layer`
 *   edge feeds it.
 * - `layer` edges come out of inputs into compositions; `composition` edges out of compositions into outputs.
 * - Each in-port takes one edge (a composition row, an output's composition port).
 */
import { DEFAULTS, type Composition, type Edge, type EdgeKind, type NFrame, type ProjectDoc, type Size } from './model';

export const MAIN = 'main';

/** Edge ids keep the v1 wire ids for the master preview and outputs (stable for the board and its tests). */
export function edgeId(from: string, to: string, kind: EdgeKind): string {
  if (kind === 'composition') return `out:${to}`;
  return to === MAIN ? `in:${from}` : `in:${from}>${to}`;
}

export function compositionById(doc: ProjectDoc, id: string = MAIN): Composition | undefined {
  return doc.compositions.find((c) => c.id === id);
}

/** The first composition ('main'); every document has one. */
export function mainComposition(doc: ProjectDoc): Composition {
  const main = compositionById(doc, MAIN) ?? doc.compositions[0];
  if (!main) throw new Error('document has no composition');
  return main;
}

export function withComposition(doc: ProjectDoc, id: string, edit: (c: Composition) => Composition): ProjectDoc {
  return { ...doc, compositions: doc.compositions.map((c) => (c.id === id ? edit(c) : c)) };
}

/** A composition's rows, front first. */
export function layerOrder(doc: ProjectDoc, compositionId: string = MAIN): string[] {
  return compositionById(doc, compositionId)?.layers ?? [];
}

/** A node's row in a composition (0 = front), or -1. */
export function portOf(doc: ProjectDoc, nodeId: string, compositionId: string = MAIN): number {
  return layerOrder(doc, compositionId).indexOf(nodeId);
}

/** The nodes that feed a composition's rows. */
export function wiredLayers(doc: ProjectDoc, compositionId: string = MAIN): Set<string> {
  return new Set(doc.edges.filter((e) => e.kind === 'layer' && e.to === compositionId).map((e) => e.from));
}

export function isLayerWired(doc: ProjectDoc, nodeId: string, compositionId: string = MAIN): boolean {
  return doc.edges.some((e) => e.kind === 'layer' && e.from === nodeId && e.to === compositionId);
}

/** The composition an output is wired to, if connected. */
export function outputComposition(doc: ProjectDoc, outputId: string): string | undefined {
  return doc.edges.find((e) => e.kind === 'composition' && e.to === outputId)?.from;
}

export type NodeType = 'source' | 'composition' | 'output';

export function nodeType(doc: ProjectDoc, id: string): NodeType | undefined {
  if (doc.sources.some((s) => s.id === id)) return 'source';
  if (doc.compositions.some((c) => c.id === id)) return 'composition';
  if (doc.outputs.some((o) => o.id === id)) return 'output';
  return undefined;
}

/** Which edge kinds may go from a node type to a node type (D32 port types). */
const ALLOWED: Record<EdgeKind, { from: readonly NodeType[]; to: readonly NodeType[] }> = {
  layer: { from: ['source'], to: ['composition'] },
  composition: { from: ['composition'], to: ['output'] },
};

/** Max reroute points on one wire (T13.8). */
export const MAX_EDGE_POINTS = 10;

/** Sets a wire's reroute points (T13.8; rounded, at most MAX_EDGE_POINTS; none = a plain curve). */
export function setEdgePoints(doc: ProjectDoc, edgeId: string, points: readonly { x: number; y: number }[]): { ok: true; doc: ProjectDoc } | { ok: false; error: 'not_found' | 'invalid' } {
  if (!doc.edges.some((e) => e.id === edgeId)) return { ok: false, error: 'not_found' };
  if (points.length > MAX_EDGE_POINTS || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { ok: false, error: 'invalid' };
  const clean = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  return {
    ok: true,
    doc: {
      ...doc,
      edges: doc.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const { points: _old, ...rest } = e;
        void _old;
        return clean.length ? { ...rest, points: clean } : rest;
      }),
    },
  };
}

export type ConnectRefusal = 'unknown_node' | 'wrong_type';

/** Why an edge may not be added (null = it may). Single-input rules are applied by the connect helpers. */
export function connectRefusal(doc: ProjectDoc, from: string, to: string, kind: EdgeKind): ConnectRefusal | null {
  const a = nodeType(doc, from);
  const b = nodeType(doc, to);
  if (!a || !b) return 'unknown_node';
  if (!ALLOWED[kind].from.includes(a) || !ALLOWED[kind].to.includes(b)) return 'wrong_type';
  return null;
}

/** A new composition (not yet part of a document). */
export function newComposition(id: string, label: string, board: { x: number; y: number }, size: Size = DEFAULTS.masterSize): Composition {
  return { id, label, size: { ...size }, placements: {}, layers: [], board: { ...board } };
}

// ---------- migrations ----------

interface WireV1 {
  id: string;
  from: string;
  to: string;
  port?: number;
}
interface DocV1 {
  schema: 1;
  rev: number;
  name: string;
  master: { size: Size; placements: Record<string, NFrame>; board: { x: number; y: number } };
  sources: (ProjectDoc['sources'][number] & { port?: number })[];
  outputs: ProjectDoc['outputs'];
  wires: WireV1[];
}

/** D39: the default names "Main preview" / "Main preview N" read "Master preview" (a renamed one is kept). */
function renameDefaultLabels(doc: ProjectDoc): ProjectDoc {
  const old = /^Main preview( \d+)?$/;
  if (!doc.compositions.some((c) => old.test(c.label))) return doc;
  return { ...doc, compositions: doc.compositions.map((c) => (old.test(c.label) ? { ...c, label: c.label.replace('Main preview', 'Master preview') } : c)) };
}

/** v2 (D32–D55): process nodes, other master previews, compositions and processes as rows, output-only layers, Core Rule nodes. */
type DocV2 = Omit<ProjectDoc, 'schema' | 'outputs'> & {
  schema: 2;
  processes?: { id: string }[];
  outputs: (ProjectDoc['outputs'][number] & { layers?: string[] })[];
  coreRules?: unknown[];
};

/**
 * D56: v2 → v3. What the page-3 board can't show leaves the document (opening a v2 project already dropped
 * most of it, D49): process nodes, master previews other than 'main' and its layouts (their outputs follow
 * 'main'), rows that aren't inputs, output-only layers and Core Rule nodes — with their wires, placements,
 * overrides, frozen frames and transform histories.
 */
function toV3(raw: DocV2): ProjectDoc {
  const { processes: _p, coreRules: _c, ...rest } = raw;
  void _p;
  void _c;
  const keep = new Set(raw.compositions.filter((c) => c.id === MAIN || c.guide?.of === MAIN).map((c) => c.id));
  const dropped = new Set(raw.compositions.filter((c) => !keep.has(c.id)).map((c) => c.id));
  const inputs = new Set(raw.sources.map((s) => s.id));
  const outputs = new Set(raw.outputs.map((o) => o.id));
  const onlyInputs = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([id]) => inputs.has(id)));
  const edges = raw.edges.flatMap((e): Edge[] => {
    if (e.kind === 'layer') return inputs.has(e.from) && keep.has(e.to) ? [e] : [];
    if (!outputs.has(e.to)) return [];
    if (keep.has(e.from)) return [e];
    // An output of a dropped master preview follows 'main'.
    return dropped.has(e.from) ? [{ ...e, from: MAIN }] : [];
  });
  const nodes = new Set([...inputs, ...keep, ...outputs, ...(raw.stacks ?? []).map((s) => s.id), ...(raw.headlines ?? []).map((h) => h.id), ...(raw.presetSets ?? []).map((s) => s.id)]);
  return {
    ...rest,
    schema: 3,
    compositions: raw.compositions
      .filter((c) => keep.has(c.id))
      .map((c) => ({
        ...c,
        layers: c.layers.filter((l) => inputs.has(l)),
        placements: onlyInputs(c.placements),
        ...(c.transforms ? { transforms: { ...c.transforms, layers: onlyInputs(c.transforms.layers) } } : {}),
      })),
    outputs: raw.outputs.map(({ layers: _l, ...o }) => {
      void _l;
      return {
        ...o,
        overrides: o.overrides.filter((ov) => inputs.has(ov.sourceId)),
        ...(o.frozen ? { frozen: { items: o.frozen.items.filter((it) => inputs.has(it.sourceId)) } } : {}),
        ...(o.transforms ? { transforms: { ...o.transforms, layers: onlyInputs(o.transforms.layers) } } : {}),
      };
    }),
    edges,
    ...(raw.groups ? { groups: raw.groups.map((g) => ({ ...g, nodes: g.nodes.filter((n) => nodes.has(n)) })) } : {}),
  };
}

/**
 * A stored document in the current schema. v1 (one master preview, `wires`, a `port` on each source) becomes
 * v2: the master preview is composition 'main' with rows in port order; wires become typed edges with the
 * same ids; overrides and frozen frames are kept. v2 becomes v3 (D56, `toV3`). Default composition names
 * read "Master preview" (D39).
 */
export function migrateProjectDoc(raw: ProjectDoc | DocV2 | DocV1): ProjectDoc {
  if (raw.schema === 3) return renameDefaultLabels(raw);
  if (raw.schema === 2) return renameDefaultLabels(toV3(raw));
  const order = [...raw.sources].sort((a, b) => (a.port ?? 0) - (b.port ?? 0)).map((s) => s.id);
  const sources = raw.sources.map(({ port: _port, ...s }) => {
    void _port;
    return s;
  });
  const known = new Set([...order, ...raw.outputs.map((o) => o.id)]);
  const edges: Edge[] = raw.wires.flatMap((w): Edge[] => {
    if (w.to === MAIN && known.has(w.from)) return [{ id: edgeId(w.from, MAIN, 'layer'), from: w.from, to: MAIN, kind: 'layer' }];
    if (w.from === MAIN && known.has(w.to)) return [{ id: edgeId(MAIN, w.to, 'composition'), from: MAIN, to: w.to, kind: 'composition' }];
    return [];
  });
  return {
    schema: 3,
    rev: raw.rev,
    name: raw.name,
    compositions: [{ id: MAIN, label: 'Master preview', size: { ...raw.master.size }, placements: { ...raw.master.placements }, layers: order, board: { ...raw.master.board } }],
    sources,
    outputs: raw.outputs,
    edges,
  };
}

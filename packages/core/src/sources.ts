/**
 * Input-source operations on a ProjectDoc (pure; ids are passed in, never generated here).
 * Invariants kept by every operation:
 * - at most LIMITS.maxSources sources;
 * - every source is a row of the master preview (`layers`, front first: row = port, D11), exactly once;
 * - nothing in the doc points at a deleted source (rows, edges, placements, output overrides, frozen frames).
 */
import { edgeId, MAIN, withComposition } from './graph';
import { LIMITS, type Behavior, type InputSource, type ProjectDoc, type SourceContent, type SourceKind, type TextStyle } from './model';

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Noto Sans',
  fontWeight: 700,
  fontSizePx: 160, // on the 3000 px default master
  color: '#111111',
  align: 'center',
  maxLines: 2,
  language: 'auto',
};

/** Which behaviours make sense for each kind of content (ADAPTATION-RULES "Rules by behaviour"). */
export const ALLOWED_BEHAVIORS: Record<SourceKind, readonly Behavior[]> = {
  image: ['background', 'subject', 'logo', 'decoration'],
  vector: ['background', 'subject', 'logo', 'decoration'],
  text: ['text'],
  fill: ['background', 'decoration'],
};

export function defaultContent(kind: SourceKind): SourceContent {
  switch (kind) {
    case 'image':
    case 'vector':
      return { kind, assetId: null, focal: { x: 0.5, y: 0.5 } };
    case 'text':
      return { kind, text: '', style: { ...DEFAULT_TEXT_STYLE } };
    case 'fill':
      return { kind, fill: { type: 'solid', color: '#ffffff' } };
  }
}

/** Board layout for input nodes: one column left of the master preview. */
export const SOURCE_COLUMN_X = -460;
export const SOURCE_ROW_GAP = 300;

/** The 4 inputs every new project starts with (D8), front to back: Logo, Headline, Subject, Background. */
export function defaultSources(): InputSource[] {
  const make = (id: string, label: string, kind: SourceKind, behavesLike: Behavior, row: number): InputSource => ({
    id,
    label,
    kind,
    behavesLike,
    visible: true,
    content: defaultContent(kind),
    board: { x: SOURCE_COLUMN_X, y: (row - 1.5) * SOURCE_ROW_GAP },
  });
  return [
    make('background', 'Background', 'fill', 'background', 0),
    make('subject', 'Subject', 'image', 'subject', 1),
    make('headline', 'Headline', 'text', 'text', 2),
    make('logo', 'Logo', 'vector', 'logo', 3),
  ];
}

export type SourceError = 'limit' | 'not_found' | 'bad_behavior' | 'output_limit' | 'invalid';
export type SourceResult = { ok: true; doc: ProjectDoc } | { ok: false; error: SourceError };

const fail = (error: SourceError): SourceResult => ({ ok: false, error });

export function canAddSource(doc: ProjectDoc): boolean {
  return doc.sources.length < LIMITS.maxSources;
}

function nextRowY(doc: ProjectDoc): number {
  const ys = doc.sources.map((s) => s.board.y);
  return ys.length === 0 ? 0 : Math.max(...ys) + SOURCE_ROW_GAP;
}

/** Adds `source` and makes it row `port` of the master preview (that row and everything behind it move back). */
function insertAt(doc: ProjectDoc, source: InputSource, port: number): ProjectDoc {
  const withRow = withComposition(doc, MAIN, (c) => {
    const layers = [...c.layers];
    layers.splice(Math.max(0, Math.min(port, layers.length)), 0, source.id);
    return { ...c, layers };
  });
  return { ...withRow, sources: [...doc.sources, source] };
}

const mainRows = (doc: ProjectDoc) => doc.compositions.find((c) => c.id === MAIN)?.layers ?? [];

/**
 * Adds a new input. It goes to the front (port 0), except backgrounds, which go to the back.
 * `board` places its node (e.g. where the canvas was right-clicked, T8.4); default: below the other inputs.
 */
export function addSource(
  doc: ProjectDoc,
  spec: { id: string; kind: SourceKind; label: string; behavesLike: Behavior; board?: { x: number; y: number } },
): SourceResult {
  if (!canAddSource(doc)) return fail('limit');
  if (!ALLOWED_BEHAVIORS[spec.kind].includes(spec.behavesLike)) return fail('bad_behavior');
  const source: InputSource = {
    id: spec.id,
    label: spec.label.trim() || spec.kind,
    kind: spec.kind,
    behavesLike: spec.behavesLike,
    visible: true,
    content: defaultContent(spec.kind),
    board: spec.board ? { x: Math.round(spec.board.x), y: Math.round(spec.board.y) } : { x: SOURCE_COLUMN_X, y: nextRowY(doc) },
  };
  const port = spec.behavesLike === 'background' ? mainRows(doc).length : 0;
  return { ok: true, doc: insertAt(doc, source, port) };
}

function update(doc: ProjectDoc, id: string, edit: (s: InputSource) => InputSource): SourceResult {
  if (!doc.sources.some((s) => s.id === id)) return fail('not_found');
  return { ok: true, doc: { ...doc, sources: doc.sources.map((s) => (s.id === id ? edit(s) : s)) } };
}

/**
 * Changes how an input adapts in outputs (D8: its behaviour's rules). Only behaviours that fit its kind;
 * an input that becomes a background goes to the back of every composition it is a row of (like adding one);
 * the others keep their row.
 */
export function setBehavior(doc: ProjectDoc, id: string, behavesLike: Behavior): SourceResult {
  const source = doc.sources.find((s) => s.id === id);
  if (!source) return fail('not_found');
  if (!ALLOWED_BEHAVIORS[source.kind].includes(behavesLike)) return fail('bad_behavior');
  if (source.behavesLike === behavesLike) return { ok: true, doc };
  const sources = doc.sources.map((s) => (s.id === id ? { ...s, behavesLike } : s));
  if (behavesLike !== 'background') return { ok: true, doc: { ...doc, sources } };
  const compositions = doc.compositions.map((c) => (c.layers.includes(id) ? { ...c, layers: [...c.layers.filter((l) => l !== id), id] } : c));
  return { ok: true, doc: { ...doc, sources, compositions } };
}

export function renameSource(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return update(doc, id, (s) => (clean ? { ...s, label: clean } : s));
}

export function setSourceVisible(doc: ProjectDoc, id: string, visible: boolean): SourceResult {
  return update(doc, id, (s) => ({ ...s, visible }));
}

/** D50: locks / unlocks a layer in every layout. */
export function setSourceLocked(doc: ProjectDoc, id: string, locked: boolean): SourceResult {
  return update(doc, id, (s) => {
    const { locked: _was, ...rest } = s;
    void _was;
    return locked ? { ...rest, locked: true } : rest;
  });
}

/**
 * Copies a source (content, behaviour, visibility) directly in front of the original in every composition it
 * is a row of. Where the original is wired, so is the copy, at the same spot (T8.1: duplicate = "the same
 * layer again").
 */
export function duplicateSource(doc: ProjectDoc, id: string, newId: string): SourceResult {
  const original = doc.sources.find((s) => s.id === id);
  if (!original) return fail('not_found');
  if (!canAddSource(doc)) return fail('limit');
  const copy: InputSource = {
    ...(JSON.parse(JSON.stringify(original)) as InputSource), // deep copy; content is plain JSON
    id: newId,
    label: `${original.label} copy`,
    board: { x: original.board.x + 40, y: original.board.y + 40 },
  };
  delete copy.libraryItemId; // a detached copy (T7.1 semantics)
  const compositions = doc.compositions.map((c) => {
    const at = c.layers.indexOf(id);
    if (at < 0) return c;
    const layers = [...c.layers];
    layers.splice(at, 0, newId);
    const placement = c.placements[id];
    return { ...c, layers, placements: placement ? { ...c.placements, [newId]: { ...placement } } : c.placements };
  });
  const copiedEdges = doc.edges
    .filter((e) => e.kind === 'layer' && e.from === id && doc.compositions.some((c) => c.id === e.to))
    .map((e) => ({ ...e, id: edgeId(newId, e.to, 'layer'), from: newId }));
  // D40: a copy of a picture in an Assets card joins the card, right after the original.
  const stacks = doc.stacks?.map((st) => {
    const at = st.items.indexOf(id);
    return at < 0 ? st : { ...st, items: [...st.items.slice(0, at + 1), newId, ...st.items.slice(at + 1)] };
  });
  return { ok: true, doc: { ...doc, sources: [...doc.sources, copy], compositions, edges: [...doc.edges, ...copiedEdges], ...(stacks ? { stacks } : {}) } };
}

/** Removes a source and everything that refers to it; the rows behind it move up. */
export function deleteSource(doc: ProjectDoc, id: string): SourceResult {
  if (!doc.sources.some((s) => s.id === id)) return fail('not_found');
  return {
    ok: true,
    doc: {
      ...doc,
      sources: doc.sources.filter((s) => s.id !== id),
      compositions: doc.compositions.map((c) => ({
        ...c,
        layers: c.layers.filter((l) => l !== id),
        placements: Object.fromEntries(Object.entries(c.placements).filter(([sourceId]) => sourceId !== id)),
      })),
      edges: doc.edges.filter((e) => e.from !== id && e.to !== id),
      ...(doc.stacks ? { stacks: doc.stacks.map((st) => (st.items.includes(id) ? { ...st, items: st.items.filter((i) => i !== id) } : st)) } : {}),
      // D44: a Headline card without one of its languages is no card (the other stays an ordinary input).
      ...(doc.headlines ? { headlines: doc.headlines.filter((p) => p.km !== id && p.en !== id) } : {}),
      outputs: doc.outputs.map((o) => ({
        ...o,
        overrides: o.overrides.filter((ov) => ov.sourceId !== id),
        ...(o.layers ? { layers: o.layers.filter((l) => l !== id) } : {}),
        ...(o.frozen ? { frozen: { items: o.frozen.items.filter((it) => it.sourceId !== id) } } : {}),
      })),
    },
  };
}

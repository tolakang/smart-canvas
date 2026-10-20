/**
 * Input-source operations on a ProjectDoc (pure; ids are passed in, never generated here).
 * Invariants kept by every operation:
 * - at most LIMITS.maxSources sources;
 * - ports are unique and contiguous 0..n-1 (port 0 = front layer, D11);
 * - a source→main wire always carries its source's current port;
 * - nothing in the doc points at a deleted source (wires, master placements, output overrides, frozen frames).
 */
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

/** Board layout for input nodes: one column left of the main preview. */
export const SOURCE_COLUMN_X = -460;
export const SOURCE_ROW_GAP = 300;

/** The 4 inputs every new project starts with (D8), front to back: Logo, Headline, Subject, Background. */
export function defaultSources(): InputSource[] {
  const make = (id: string, label: string, kind: SourceKind, behavesLike: Behavior, port: number, row: number): InputSource => ({
    id,
    label,
    kind,
    behavesLike,
    port,
    visible: true,
    content: defaultContent(kind),
    board: { x: SOURCE_COLUMN_X, y: (row - 1.5) * SOURCE_ROW_GAP },
  });
  return [
    make('background', 'Background', 'fill', 'background', 3, 0),
    make('subject', 'Subject', 'image', 'subject', 2, 1),
    make('headline', 'Headline', 'text', 'text', 1, 2),
    make('logo', 'Logo', 'vector', 'logo', 0, 3),
  ];
}

export type SourceError = 'limit' | 'not_found' | 'bad_behavior' | 'output_limit' | 'invalid';
export type SourceResult = { ok: true; doc: ProjectDoc } | { ok: false; error: SourceError };

const fail = (error: SourceError): SourceResult => ({ ok: false, error });

export function canAddSource(doc: ProjectDoc): boolean {
  return doc.sources.length < LIMITS.maxSources;
}

/** Renumbers ports 0..n-1 keeping the current stacking order. */
export function normalizePorts(sources: InputSource[]): InputSource[] {
  const order = [...sources].sort((a, b) => a.port - b.port).map((s) => s.id);
  return sources.map((s) => (s.port === order.indexOf(s.id) ? s : { ...s, port: order.indexOf(s.id) }));
}

/** Sets the sources (ports renumbered 0..n-1) and brings every source→main wire's port in line. */
export function withSources(doc: ProjectDoc, sources: InputSource[]): ProjectDoc {
  const normalized = normalizePorts(sources);
  const portOf = new Map(normalized.map((s) => [s.id, s.port]));
  const wires = doc.wires.map((w) => {
    const port = w.to === 'main' ? portOf.get(w.from) : undefined;
    return port === undefined || w.port === port ? w : { ...w, port };
  });
  return { ...doc, sources: normalized, wires };
}

function nextRowY(doc: ProjectDoc): number {
  const ys = doc.sources.map((s) => s.board.y);
  return ys.length === 0 ? 0 : Math.max(...ys) + SOURCE_ROW_GAP;
}

/** Inserts `source` at `port`, pushing that port and everything behind it one step back. */
function insertAt(doc: ProjectDoc, source: InputSource, port: number): ProjectDoc {
  const shifted = doc.sources.map((s) => (s.port >= port ? { ...s, port: s.port + 1 } : s));
  return withSources(doc, [...shifted, { ...source, port }]);
}

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
    port: 0,
    visible: true,
    content: defaultContent(spec.kind),
    board: spec.board ? { x: Math.round(spec.board.x), y: Math.round(spec.board.y) } : { x: SOURCE_COLUMN_X, y: nextRowY(doc) },
  };
  const port = spec.behavesLike === 'background' ? doc.sources.length : 0;
  return { ok: true, doc: insertAt(doc, source, port) };
}

function update(doc: ProjectDoc, id: string, edit: (s: InputSource) => InputSource): SourceResult {
  if (!doc.sources.some((s) => s.id === id)) return fail('not_found');
  return { ok: true, doc: { ...doc, sources: doc.sources.map((s) => (s.id === id ? edit(s) : s)) } };
}

export function renameSource(doc: ProjectDoc, id: string, label: string): SourceResult {
  const clean = label.trim();
  return update(doc, id, (s) => (clean ? { ...s, label: clean } : s));
}

export function setSourceVisible(doc: ProjectDoc, id: string, visible: boolean): SourceResult {
  return update(doc, id, (s) => ({ ...s, visible }));
}

/**
 * Copies a source (content, behaviour, visibility) directly in front of the original. A wired original's copy
 * is wired too, at the same spot on the main preview (T8.1: duplicate = "the same layer again").
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
  const wired = doc.wires.some((w) => w.from === id && w.to === 'main');
  const placement = doc.master.placements[id];
  const withCopy: ProjectDoc = wired
    ? {
        ...doc,
        wires: [...doc.wires, { id: `in:${newId}`, from: newId, to: 'main', port: original.port }],
        master: placement ? { ...doc.master, placements: { ...doc.master.placements, [newId]: { ...placement } } } : doc.master,
      }
    : doc;
  return { ok: true, doc: insertAt(withCopy, copy, original.port) };
}

/** Removes a source and everything that refers to it; remaining ports close the gap. */
export function deleteSource(doc: ProjectDoc, id: string): SourceResult {
  if (!doc.sources.some((s) => s.id === id)) return fail('not_found');
  const placements = Object.fromEntries(Object.entries(doc.master.placements).filter(([sourceId]) => sourceId !== id));
  const rest = { ...doc, wires: doc.wires.filter((w) => w.from !== id && w.to !== id) };
  return {
    ok: true,
    doc: {
      ...withSources(rest, doc.sources.filter((s) => s.id !== id)),
      master: { ...doc.master, placements },
      outputs: doc.outputs.map((o) => ({
        ...o,
        overrides: o.overrides.filter((ov) => ov.sourceId !== id),
        ...(o.frozen ? { frozen: { items: o.frozen.items.filter((it) => it.sourceId !== id) } } : {}),
      })),
    },
  };
}

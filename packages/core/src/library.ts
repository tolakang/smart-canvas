/**
 * Team library (D14, T7.1): a source saved once, reused in any project of the team. Using an item adds a
 * detached copy (later library edits don't change projects) that remembers where it came from.
 */
import { ALLOWED_BEHAVIORS, addSource, type SourceResult } from './sources';
import type { Behavior, InputSource, LibraryItem, ProjectDoc, SourceContent, SourceKind } from './model';

export type LibraryEntry = Pick<LibraryItem, 'name' | 'kind' | 'behavesLike' | 'content'>;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** What "Save to library" stores for a source. */
export function libraryEntryOf(source: InputSource, name = source.label): LibraryEntry {
  return { name: name.trim() || source.label, kind: source.kind, behavesLike: source.behavesLike, content: copy(source.content) };
}

/** True when kind, behaviour and content agree (the same rules as Add input). */
export function isValidLibraryEntry(e: { kind: SourceKind; behavesLike: Behavior; content: SourceContent }): boolean {
  return ALLOWED_BEHAVIORS[e.kind].includes(e.behavesLike) && e.content.kind === e.kind;
}

/** Adds a detached copy of a library item as a new input (front, or back for backgrounds; cap 10). */
export function addSourceFromLibrary(
  doc: ProjectDoc,
  item: Pick<LibraryItem, 'id' | 'name' | 'kind' | 'behavesLike' | 'content'>,
  id: string,
  board?: { x: number; y: number },
): SourceResult {
  if (!isValidLibraryEntry(item)) return { ok: false, error: 'bad_behavior' };
  const r = addSource(doc, { id, label: item.name, kind: item.kind, behavesLike: item.behavesLike, ...(board ? { board } : {}) });
  if (!r.ok) return r;
  return {
    ok: true,
    doc: { ...r.doc, sources: r.doc.sources.map((s) => (s.id === id ? { ...s, content: copy(item.content), libraryItemId: item.id } : s)) },
  };
}

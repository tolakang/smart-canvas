/**
 * Placements on a composition (NFrame, 0..1 of its canvas; rotation in degrees). Default: the main preview.
 * Flow 3: an input is auto-placed by its behaviour the first time it is wired; the main editor then moves it.
 */
import { MAIN, withComposition } from './graph';
import type { Behavior, NFrame, ProjectDoc } from './model';
import type { SourceResult } from './sources';

const DEFAULT_PLACEMENT: Record<Behavior, NFrame> = {
  background: { x: 0, y: 0, w: 1, h: 1 },
  subject: { x: 0.2, y: 0.12, w: 0.6, h: 0.6 },
  text: { x: 0.08, y: 0.76, w: 0.84, h: 0.16 },
  logo: { x: 0.72, y: 0.04, w: 0.24, h: 0.12 },
  decoration: { x: 0.35, y: 0.35, w: 0.3, h: 0.3 },
};

export function defaultPlacement(behavesLike: Behavior): NFrame {
  return { ...DEFAULT_PLACEMENT[behavesLike] };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Sets a source's placement on a composition (values rounded to 1e-6; zero rotation dropped). */
export function setPlacement(doc: ProjectDoc, sourceId: string, frame: NFrame, compositionId: string = MAIN): SourceResult {
  if (!doc.sources.some((s) => s.id === sourceId) || !doc.compositions.some((c) => c.id === compositionId)) return { ok: false, error: 'not_found' };
  const rotation = frame.rotation ? round(((frame.rotation % 360) + 360) % 360) : 0;
  const clean: NFrame = {
    x: round(frame.x),
    y: round(frame.y),
    w: round(Math.max(frame.w, 1e-4)),
    h: round(Math.max(frame.h, 1e-4)),
    ...(rotation ? { rotation } : {}),
  };
  return { ok: true, doc: withComposition(doc, compositionId, (c) => ({ ...c, placements: { ...c.placements, [sourceId]: clean } })) };
}

/** Gives a source its behaviour's default placement if it has none (used when it is first wired). */
export function ensurePlacement(doc: ProjectDoc, sourceId: string, compositionId: string = MAIN): ProjectDoc {
  const source = doc.sources.find((s) => s.id === sourceId);
  const comp = doc.compositions.find((c) => c.id === compositionId);
  if (!source || !comp || comp.placements[sourceId]) return doc;
  const r = setPlacement(doc, sourceId, defaultPlacement(source.behavesLike), compositionId);
  return r.ok ? r.doc : doc;
}

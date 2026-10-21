/**
 * Placements on a composition (NFrame, 0..1 of its canvas; rotation in degrees). Default: the main preview.
 * Flow 3: an input is auto-placed by its behaviour the first time it is wired; the main editor then moves it.
 */
import { MAIN, withComposition } from './graph';
import { cleanShear, type Behavior, type NFrame, type ProjectDoc } from './model';
import { isLayerNode, layerSource } from './processes';
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

/** Sets a source's placement on a composition (values rounded to 1e-6; zero rotation and shear dropped). */
export function setPlacement(doc: ProjectDoc, sourceId: string, frame: NFrame, compositionId: string = MAIN): SourceResult {
  if (!isLayerNode(doc, sourceId) || !doc.compositions.some((c) => c.id === compositionId)) return { ok: false, error: 'not_found' };
  const rotation = frame.rotation ? round(((frame.rotation % 360) + 360) % 360) : 0;
  const shear = cleanShear(frame.shear);
  // D37: a frame fitted to its picture stays fitted when it's moved or resized (only replacing the picture
  // clears it, see unfitPictures).
  const fitted = frame.fitted ?? doc.compositions.find((c) => c.id === compositionId)?.placements[sourceId]?.fitted;
  const clean: NFrame = {
    x: round(frame.x),
    y: round(frame.y),
    w: round(Math.max(frame.w, 1e-4)),
    h: round(Math.max(frame.h, 1e-4)),
    ...(rotation ? { rotation } : {}),
    ...(shear ? { shear } : {}),
    ...(fitted ? { fitted: true as const } : {}),
  };
  return { ok: true, doc: withComposition(doc, compositionId, (c) => ({ ...c, placements: { ...c.placements, [sourceId]: clean } })) };
}

/** Gives a source its behaviour's default placement if it has none (used when it is first wired). */
export function ensurePlacement(doc: ProjectDoc, sourceId: string, compositionId: string = MAIN): ProjectDoc {
  const source = layerSource(doc, sourceId);
  const comp = doc.compositions.find((c) => c.id === compositionId);
  if (!source || !comp || comp.placements[sourceId]) return doc;
  const r = setPlacement(doc, sourceId, defaultPlacement(source.behavesLike), compositionId);
  return r.ok ? r.doc : doc;
}

/**
 * Saved editor transform histories (D37). The editor box records each gesture as operations (D36); these
 * helpers keep that history in the project document so a double-click reset still works after a reload.
 * History is stored per scene (composition or output) in design px; a scene size change invalidates it.
 */
import type { LayerTransforms, ProjectDoc, TransformHistory } from './model';
import type { SourceResult } from './sources';

/** Which scene the history belongs to. */
export type TransformTarget = { compositionId: string } | { outputId: string };

interface Host {
  transforms?: LayerTransforms;
}

function hostOf(doc: ProjectDoc, target: TransformTarget): Host | undefined {
  return 'compositionId' in target ? doc.compositions.find((c) => c.id === target.compositionId) : doc.outputs.find((o) => o.id === target.outputId);
}

const sameScene = (a: { width: number; height: number } | undefined, b: { width: number; height: number }) => !!a && a.width === b.width && a.height === b.height;

/** The saved history for a layer, if it belongs to the scene's current size. */
export function layerTransform(doc: ProjectDoc, sourceId: string, target: TransformTarget, scene: { width: number; height: number }): TransformHistory | undefined {
  const saved = hostOf(doc, target)?.transforms;
  return saved && sameScene(saved.scene, scene) ? saved.layers[sourceId] : undefined;
}

/**
 * Saves a layer's history. When the scene's size changed, the other layers' histories are dropped: their
 * pixel coordinates no longer mean the same thing.
 */
export function setLayerTransform(doc: ProjectDoc, sourceId: string, history: TransformHistory, target: TransformTarget, scene: { width: number; height: number }): SourceResult {
  if ('compositionId' in target) {
    const index = doc.compositions.findIndex((c) => c.id === target.compositionId);
    const current = doc.compositions[index];
    if (!current) return { ok: false, error: 'not_found' };
    const layers = sameScene(current.transforms?.scene, scene) ? { ...current.transforms?.layers, [sourceId]: history } : { [sourceId]: history };
    const compositions = doc.compositions.map((c, i) => (i === index ? { ...c, transforms: { scene, layers } } : c));
    return { ok: true, doc: { ...doc, compositions } };
  }
  const index = doc.outputs.findIndex((o) => o.id === target.outputId);
  const current = doc.outputs[index];
  if (!current) return { ok: false, error: 'not_found' };
  const layers = sameScene(current.transforms?.scene, scene) ? { ...current.transforms?.layers, [sourceId]: history } : { [sourceId]: history };
  const outputs = doc.outputs.map((o, i) => (i === index ? { ...o, transforms: { scene, layers } } : o));
  return { ok: true, doc: { ...doc, outputs } };
}

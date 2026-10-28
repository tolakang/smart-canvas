/**
 * Master preview editor (T3.2): the shared canvas editor on the master; edits write master.placements
 * (normalized to the master canvas) through the board (autosave).
 */
import { compositionById, deleteSource, layerSpots, MAIN, mainComposition, masterOf, masterScene, setLayerTransform, setPlacement } from '@smart-canvas/core';
import type { Frame, TransformHistory } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { confirmDelete } from '../board/LayerRow';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';

export function MainEditor({ compositionId = MAIN, onClose }: { compositionId?: string; onClose: () => void }) {
  const { doc, run } = useBoard();
  const scene = useMemo(() => masterScene(doc, compositionId), [doc, compositionId]);
  const main = compositionById(doc, compositionId) ?? mainComposition(doc);
  const { width, height } = scene;
  const onCommit = useCallback(
    (id: string, f: Frame, history?: TransformHistory) =>
      run((d) => {
        const placed = setPlacement(d, id, { x: f.x / width, y: f.y / height, w: f.w / width, h: f.h / height, ...(f.rotation ? { rotation: f.rotation } : {}), ...(f.shear ? { shear: f.shear } : {}) }, main.id);
        // One undo step for the gesture and its reset history (D41).
        return placed.ok && history ? setLayerTransform(placed.doc, id, history, { compositionId: main.id }, { width, height }) : placed;
      }),
    [run, width, height, main.id],
  );
  // Typed values / nudges update the history after the frame write; metadata, so no extra undo step.
  const onHistory = useCallback(
    (id: string, history: TransformHistory) => {
      run((d) => setLayerTransform(d, id, history, { compositionId: main.id }, { width, height }), { silent: true });
    },
    [run, width, height, main.id],
  );
  const histories = layerHistories(main, { width, height });
  // M1: a layer snaps to where it sits in the master's other layouts.
  const spotsOf = useCallback((id: string) => layerSpots(doc, main.id, id, main.id), [doc, main.id]);
  // D50: in the master's vertical / horizontal layout the layers are the master's — their order, wiring, lock,
  // visibility and deletion apply in all three layouts; only positions and sizes are this layout's.
  const rowsOf = masterOf(doc, main.id);
  // Delete key: as the layer row's trash button (D50: deleting in any layout deletes the input everywhere).
  const onDelete = useCallback(
    (id: string) => {
      const input = doc.sources.find((s) => s.id === id);
      if (input && confirmDelete(input.label)) run((d) => deleteSource(d, id));
    },
    [doc, run],
  );
  return (
    <CanvasEditor
      label="Main Comps editor"
      title={
        <>
          <strong>Main Comps</strong>
          <span className="sc-muted">
            {main.size.width} × {main.size.height} {main.size.unit}
          </span>
        </>
      }
      scene={scene}
      onCommit={onCommit}
      onHistory={onHistory}
      histories={histories}
      onDelete={onDelete}
      spotsOf={spotsOf}
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} compositionId={rowsOf} />}
      props={(s) => (s.content.kind === 'text' ? <TextPanel key={s.id} source={{ ...s, content: s.content }} /> : null)}
      onClose={onClose}
    />
  );
}


/** The composition's saved histories, only while they were saved for the scene's current size. */
function layerHistories(comp: ReturnType<typeof compositionById>, scene: { width: number; height: number }): Record<string, TransformHistory> | undefined {
  const saved = comp?.transforms;
  return saved && saved.scene.width === scene.width && saved.scene.height === scene.height ? saved.layers : undefined;
}

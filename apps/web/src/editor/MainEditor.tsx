/**
 * Master preview editor (T3.2): the shared canvas editor on the master; edits write master.placements
 * (normalized to the master canvas) through the board (autosave).
 */
import { compositionById, deleteSource, MAIN, mainComposition, masterOf, masterScene, removeRow, setLayerTransform, setPlacement } from '@smart-canvas/core';
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
  // D50: in the master's vertical / horizontal layout the layers are the master's — their order, wiring, lock,
  // visibility and deletion apply in all three layouts; only positions and sizes are this layout's.
  const rowsOf = masterOf(doc, main.id);
  // Delete key: as the layer row's trash button — on the first master preview an input is deleted (with a
  // confirm); a process row, or any row of another master preview, is taken off this preview.
  const onDelete = useCallback(
    (id: string) => {
      const input = doc.sources.find((s) => s.id === id);
      if (rowsOf === MAIN && input) {
        if (confirmDelete(input.label)) run((d) => deleteSource(d, id));
      } else run((d) => removeRow(d, rowsOf, id));
    },
    [doc, run, rowsOf],
  );
  return (
    <CanvasEditor
      label="Master preview editor"
      title={
        <>
          <strong>{main.label}</strong>
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
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} compositionId={rowsOf} />}
      // A process row's text belongs to its Text variant (inspector), not to its input (T12.6).
      props={(s) => (s.content.kind === 'text' && doc.sources.some((x) => x.id === s.id) ? <TextPanel key={s.id} source={{ ...s, content: s.content }} /> : null)}
      onClose={onClose}
    />
  );
}


/** The composition's saved histories, only while they were saved for the scene's current size. */
function layerHistories(comp: ReturnType<typeof compositionById>, scene: { width: number; height: number }): Record<string, TransformHistory> | undefined {
  const saved = comp?.transforms;
  return saved && saved.scene.width === scene.width && saved.scene.height === scene.height ? saved.layers : undefined;
}

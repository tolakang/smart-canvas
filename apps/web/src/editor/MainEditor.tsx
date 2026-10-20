/**
 * Main preview editor (T3.2): the shared canvas editor on the master; edits write master.placements
 * (normalized to the master canvas) through the board (autosave).
 */
import { compositionById, MAIN, mainComposition, masterScene, setPlacement } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';

export function MainEditor({ compositionId = MAIN, onClose }: { compositionId?: string; onClose: () => void }) {
  const { doc, run } = useBoard();
  const scene = useMemo(() => masterScene(doc, compositionId), [doc, compositionId]);
  const main = compositionById(doc, compositionId) ?? mainComposition(doc);
  const { width, height } = scene;
  const onCommit = useCallback(
    (id: string, f: { x: number; y: number; w: number; h: number; rotation?: number }) =>
      run((d) => setPlacement(d, id, { x: f.x / width, y: f.y / height, w: f.w / width, h: f.h / height, ...(f.rotation ? { rotation: f.rotation } : {}) }, main.id)),
    [run, width, height, main.id],
  );
  return (
    <CanvasEditor
      label="Main preview editor"
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
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} compositionId={main.id} />}
      // A process row's text belongs to its Text variant (inspector), not to its input (T12.6).
      props={(s) => (s.content.kind === 'text' && doc.sources.some((x) => x.id === s.id) ? <TextPanel key={s.id} source={{ ...s, content: s.content }} /> : null)}
      onClose={onClose}
    />
  );
}

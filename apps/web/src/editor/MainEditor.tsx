/**
 * Main preview editor (T3.2): the shared canvas editor on the master; edits write master.placements
 * (normalized to the master canvas) through the board (autosave).
 */
import { masterScene, setPlacement } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';

export function MainEditor({ onClose }: { onClose: () => void }) {
  const { doc, run } = useBoard();
  const scene = useMemo(() => masterScene(doc), [doc]);
  const { width, height } = scene;
  const onCommit = useCallback(
    (id: string, f: { x: number; y: number; w: number; h: number; rotation?: number }) =>
      run((d) => setPlacement(d, id, { x: f.x / width, y: f.y / height, w: f.w / width, h: f.h / height, ...(f.rotation ? { rotation: f.rotation } : {}) })),
    [run, width, height],
  );
  return (
    <CanvasEditor
      label="Main preview editor"
      title={
        <>
          <strong>Main preview</strong>
          <span className="sc-muted">
            {doc.master.size.width} × {doc.master.size.height} {doc.master.size.unit}
          </span>
        </>
      }
      scene={scene}
      onCommit={onCommit}
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} />}
      props={(s) => (s.content.kind === 'text' ? <TextPanel key={s.id} source={{ ...s, content: s.content }} /> : null)}
      onClose={onClose}
    />
  );
}

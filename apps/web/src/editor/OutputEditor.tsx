/**
 * Output editor (T5.1, D13): the shared canvas editor on one output's computed layout. Every edit is an
 * override on that output (move/resize/rotate → frame, text panel → style, eye → hidden); the master
 * and the other outputs are untouched.
 */
import { computeLayout, outputScene, setOverrideFrame, type Frame } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';

export function OutputEditor({ outputId, onClose }: { outputId: string; onClose: () => void }) {
  const { doc, run, layoutDeps, author } = useBoard();
  const output = doc.outputs.find((o) => o.id === outputId);
  const scene = useMemo(
    () => (output && layoutDeps ? outputScene(computeLayout(doc, output.id, layoutDeps), output) : null),
    [doc, output, layoutDeps],
  );
  const onCommit = useCallback((id: string, frame: Frame) => run((d) => setOverrideFrame(d, outputId, id, frame, author())), [run, outputId, author]);

  if (!output) return null;
  if (!scene) return <div className="sc-editor-screen sc-muted">Loading fonts…</div>;
  const connected = doc.wires.some((w) => w.from === 'main' && w.to === output.id);
  return (
    <CanvasEditor
      label={`Output editor ${output.label}`}
      title={
        <>
          <strong>{output.label}</strong>
          <span className="sc-muted">
            {output.size.width} × {output.size.height} {output.size.unit}
            {(output.bleedMm ?? 0) > 0 && ` · bleed ${output.bleedMm} mm`}
            {!connected && ' · disconnected (frozen)'}
          </span>
          <span className="sc-muted">Changes here are overrides on this output only</span>
        </>
      }
      scene={scene}
      onCommit={onCommit}
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} outputId={output.id} />}
      props={(s) => (s.content.kind === 'text' ? <TextPanel key={s.id} source={{ ...s, content: s.content }} outputId={output.id} /> : null)}
      onClose={onClose}
    />
  );
}

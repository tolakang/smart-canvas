/**
 * Output editor (T5.1, D13): the shared canvas editor on one output's computed layout. Every edit is an
 * override on that output (move/resize/rotate → frame, text panel → style, eye → hidden); the master
 * and the other outputs are untouched.
 */
import { computeLayout, isOutputConnected, outputScene, resetOutputOverrides, setLayerTransform, setOverrideFrame, setOverrideHidden, type Frame, type OutputNode, type TransformHistory } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { OverrideInspector } from './OverrideInspector';
import { TextPanel } from './TextPanel';

export function OutputEditor({ outputId, onClose }: { outputId: string; onClose: () => void }) {
  const { doc, run, layoutDeps, author, readOnly } = useBoard();
  const output = doc.outputs.find((o) => o.id === outputId);
  const scene = useMemo(
    () => (output && layoutDeps ? outputScene(computeLayout(doc, output.id, layoutDeps), output) : null),
    [doc, output, layoutDeps],
  );
  // A frame without rotation / shear means 0: write that only when it replaces a non-zero value (else the
  // layer keeps following the master's).
  const size = useMemo(() => (scene ? { width: scene.width, height: scene.height } : null), [scene]);
  const onCommit = useCallback(
    (id: string, frame: Frame, history?: TransformHistory) => {
      const cur = scene?.items.find((i) => i.sourceId === id)?.frame;
      const zeroed = { ...(cur?.rotation && !frame.rotation ? { rotation: 0 } : {}), ...(cur?.shear && !frame.shear ? { shear: 0 } : {}) };
      run((d) => {
        const overridden = setOverrideFrame(d, outputId, id, { ...frame, ...zeroed }, author());
        // One undo step for the gesture and its reset history (D37).
        return overridden.ok && history && size ? setLayerTransform(overridden.doc, id, history, { outputId }, size) : overridden;
      });
    },
    [run, outputId, author, scene, size],
  );
  // Typed values / nudges update the history after the override write; metadata, so no extra undo step.
  const onHistory = useCallback(
    (id: string, history: TransformHistory) => {
      if (!size) return;
      run((d) => setLayerTransform(d, id, history, { outputId }, size), { silent: true });
    },
    [run, outputId, size],
  );

  if (!output) return null;
  if (!scene) return <div className="sc-editor-screen sc-muted">Loading fonts…</div>;
  const connected = isOutputConnected(doc, output.id);
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
          {!readOnly && (
            <button
              type="button"
              disabled={output.overrides.length === 0}
              onClick={() => window.confirm(`Reset all ${output.overrides.length} overridden layers of “${output.label}” to auto?`) && run((d) => resetOutputOverrides(d, output.id))}
            >
              Reset output
            </button>
          )}
        </>
      }
      scene={scene}
      onCommit={onCommit}
      onHistory={onHistory}
      histories={layerHistories(output, scene ? { width: scene.width, height: scene.height } : null)}
      // Delete key: a layer can't be deleted from one output; it's hidden there (eye in the layers panel).
      onDelete={readOnly ? undefined : (id) => run((d) => setOverrideHidden(d, output.id, id, true, author()))}
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} outputId={output.id} />}
      props={(s) => (
        <div className="sc-editor__side">
          <OverrideInspector outputId={output.id} sourceId={s.id} />
          {s.content.kind === 'text' && <TextPanel key={s.id} source={{ ...s, content: s.content }} outputId={output.id} />}
        </div>
      )}
      onClose={onClose}
    />
  );
}


/** The output's saved histories, only while they were saved for the scene's current size. */
function layerHistories(output: OutputNode, scene: { width: number; height: number } | null): Record<string, TransformHistory> | undefined {
  const saved = output.transforms;
  return scene && saved && saved.scene.width === scene.width && saved.scene.height === scene.height ? saved.layers : undefined;
}

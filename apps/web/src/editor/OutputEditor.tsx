/**
 * Output editor (T5.1, D13): the shared canvas editor on one output's computed layout. Every edit is an
 * override on that output (move/resize/rotate → frame, text panel → style, eye → hidden); the master
 * and the other outputs are untouched.
 */
import { computeLayout, isOutputConnected, outputScene, resetOutputOverrides, setOverrideFrame, setOverrideHidden, type Frame } from '@smart-canvas/core';
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
  const onCommit = useCallback(
    (id: string, frame: Frame) => {
      const cur = scene?.items.find((i) => i.sourceId === id)?.frame;
      const zeroed = { ...(cur?.rotation && !frame.rotation ? { rotation: 0 } : {}), ...(cur?.shear && !frame.shear ? { shear: 0 } : {}) };
      run((d) => setOverrideFrame(d, outputId, id, { ...frame, ...zeroed }, author()));
    },
    [run, outputId, author, scene],
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

/**
 * Output editor (T5.1, D13): the shared canvas editor on one output's computed layout. Every edit is an
 * override on that output (move/resize/rotate → frame, text panel → style, eye → hidden); the master
 * and the other outputs are untouched.
 * D63: the Comment tool turns a click or tap on the Preview into a pinned comment; the Comments panel takes the
 * Design panel's place while it is on.
 */
import { computeLayout, isOutputConnected, previewFingerprint, layerSpots, outputComposition, outputScene, resetOutputOverrides, setLayerTransform, setOverrideFrame, setOverrideHidden, type Frame, type OutputNode, type TransformHistory } from '@smart-canvas/core';
import { useCallback, useMemo, useState } from 'react';
import { useBoard } from '../board/context';
import { threadsOf } from '../board/review';
import { CanvasEditor } from './CanvasEditor';
import { CommentPins, CommentsPanel } from './CommentsPanel';
import { LayersPanel } from './LayersPanel';
import { OverrideInspector } from './OverrideInspector';
import { TextPanel } from './TextPanel';
import { COMMENT_TOOL, COUNT, LOADING } from './shell';
import { SIDE } from './panels';

export function OutputEditor({ outputId, comments = false, onClose }: { outputId: string; comments?: boolean; onClose: () => void }) {
  const { doc, run, layoutDeps, author, readOnly, review, reviewApprove } = useBoard();
  /** D63: the Comment tool, the pin being written, the thread picked, and whether resolved threads show. */
  const [commenting, setCommenting] = useState(comments);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const output = doc.outputs.find((o) => o.id === outputId);
  const layout = useMemo(() => (output && layoutDeps ? computeLayout(doc, output.id, layoutDeps) : null), [doc, output, layoutDeps]);
  const scene = useMemo(() => (output && layout ? outputScene(layout, output) : null), [output, layout]);
  // D63: what this Preview looks like now, to approve it (and to tell an approval it has changed since).
  const fingerprint = useMemo(() => (output && layout ? previewFingerprint(doc, output.id, layout) : ''), [doc, output, layout]);
  // A frame without rotation / shear means 0: write that only when it replaces a non-zero value (else the
  // layer keeps following the master's).
  const size = useMemo(() => (scene ? { width: scene.width, height: scene.height } : null), [scene]);
  const onCommit = useCallback(
    (id: string, frame: Frame, history?: TransformHistory) => {
      const cur = scene?.items.find((i) => i.sourceId === id)?.frame;
      const zeroed = {
        ...(cur?.rotation && !frame.rotation ? { rotation: 0 } : {}),
        ...(cur?.shear && !frame.shear ? { shear: 0 } : {}),
        // D37: editing a fitted frame keeps it fitted (else the fit pass would fit it a second time).
        ...(cur?.fitted ? { fitted: true as const } : {}),
      };
      run((d) => {
        const overridden = setOverrideFrame(d, outputId, id, { ...frame, ...zeroed }, author());
        // One undo step for the gesture and its reset history (D41).
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

  // M1: a layer snaps to where it sits in each of its master's layouts.
  const master = output ? outputComposition(doc, output.id) : undefined;
  const spotsOf = useCallback((id: string) => (master ? layerSpots(doc, master, id) : []), [doc, master]);

  if (!output) return null;
  if (!scene) return <div className={LOADING}>Loading fonts…</div>;
  const connected = isOutputConnected(doc, output.id);
  const openThreads = threadsOf(review, output.id).length;
  return (
    <CanvasEditor
      label={`Preview editor ${output.label}`}
      title={
        <>
          <strong>{output.label}</strong>
          <span className="sc-muted">
            {output.size.width} × {output.size.height} {output.size.unit}
            {(output.bleedMm ?? 0) > 0 && ` · bleed ${output.bleedMm} mm`}
            {!connected && ' · disconnected (frozen)'}
          </span>
          <span className="sc-muted">Changes here apply to this Preview only</span>
          <Approval outputId={output.id} fingerprint={fingerprint} onApprove={reviewApprove} />
          {!readOnly && (
            <button
              type="button"
              disabled={output.overrides.length === 0}
              onClick={() => window.confirm(`Reset all ${output.overrides.length} overridden layers of “${output.label}” to auto?`) && run((d) => resetOutputOverrides(d, output.id))}
            >
              Reset this Preview
            </button>
          )}
        </>
      }
      scene={scene}
      onCommit={onCommit}
      onHistory={onHistory}
      histories={layerHistories(output, scene ? { width: scene.width, height: scene.height } : null)}
      // Delete key: a layer can't be deleted from one output; it's hidden there (eye in the layers panel).
      spotsOf={spotsOf}
      onDelete={readOnly ? undefined : (id) => run((d) => setOverrideHidden(d, output.id, id, true, author()))}
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} outputId={output.id} />}
      props={(s) => (
        <div className={SIDE}>
          <OverrideInspector outputId={output.id} sourceId={s.id} />
          {s.content.kind === 'text' && <TextPanel key={s.id} source={{ ...s, content: s.content }} outputId={output.id} />}
        </div>
      )}
      tools={
        <button
          type="button"
          className={COMMENT_TOOL}
          aria-label="Comment"
          title="Comment: pin a comment on the Preview"
          aria-pressed={commenting}
          onClick={() => {
            setCommenting((on) => !on);
            setPending(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
          </svg>
          {openThreads > 0 && <span className={COUNT}>{openThreads}</span>}
        </button>
      }
      overlay={
        commenting
          ? (scale) => (
              <CommentPins threads={threadsOf(review, output.id, showResolved)} scene={scene} scale={scale} active={active} pending={pending} onPick={setActive} />
            )
          : undefined
      }
      onPoint={commenting ? (p) => (setPending(p), setActive(null)) : undefined}
      aside={
        commenting ? (
          <CommentsPanel outputId={output.id} showResolved={showResolved} onShowResolved={setShowResolved} pending={pending} onPending={setPending} active={active} onActive={setActive} />
        ) : undefined
      }
      onClose={onClose}
    />
  );
}


/** The output's saved histories, only while they were saved for the scene's current size. */
function layerHistories(output: OutputNode, scene: { width: number; height: number } | null): Record<string, TransformHistory> | undefined {
  const saved = output.transforms;
  return scene && saved && saved.scene.width === scene.width && saved.scene.height === scene.height ? saved.layers : undefined;
}

/**
 * D63: the Preview's approval in the editor's bar. Editors approve it as it looks now, approve it again after a
 * change, or withdraw; viewers see the state only.
 */
/** The approval state in the editor bar: green once approved, amber once the Preview changed since. */
const STATE = 'sc-approval__state text-[11px] font-[600]';
/** Approve: solid green; the bar's own hover and disabled looks still win, as before. */
const APPROVE =
  'sc-approval__approve font-[600] border-ok [&:is(:not(:hover),:disabled)]:bg-ok [&:not(:disabled)]:text-on-accent';

function Approval(props: { outputId: string; fingerprint: string; onApprove: (outputId: string, fingerprint: string | null) => Promise<void> }) {
  const { review, readOnly } = useBoard();
  const [busy, setBusy] = useState(false);
  const approval = review?.approvals.find((a) => a.outputId === props.outputId);
  const changed = approval && props.fingerprint && approval.fingerprint !== props.fingerprint;
  const act = (fingerprint: string | null) => {
    setBusy(true);
    void props.onApprove(props.outputId, fingerprint).finally(() => setBusy(false));
  };
  return (
    <span className={`sc-approval${approval ? (changed ? ' sc-approval--changed' : ' sc-approval--on') : ''} ml-8 inline-flex items-center gap-6`} role="group" aria-label="Approval">
      {approval ? (
        <span className={`${STATE} ${changed ? 'text-warn' : 'text-ok'}`} title={`Approved by ${approval.approvedBy ?? 'someone'} on ${new Date(approval.approvedAt).toLocaleString()}`}>
          {changed ? 'Changed since approved' : `✓ Approved${approval.approvedBy ? ` by ${approval.approvedBy}` : ''}`}
        </span>
      ) : (
        readOnly && <span className={STATE}>Not approved</span>
      )}
      {!readOnly && (!approval || changed) && (
        <button type="button" className={APPROVE} disabled={busy || !props.fingerprint} onClick={() => act(props.fingerprint)}>
          {approval ? 'Approve again' : 'Approve'}
        </button>
      )}
      {!readOnly && approval && (
        <button type="button" disabled={busy} onClick={() => act(null)}>
          Withdraw
        </button>
      )}
    </span>
  );
}

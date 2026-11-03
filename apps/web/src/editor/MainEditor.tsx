/**
 * Master preview editor (T3.2): the shared canvas editor on the master; edits write master.placements
 * (normalized to the master canvas) through the board (autosave).
 */
import {
  compositionById,
  deleteSource,
  followMaster,
  guideRows,
  layerSpots,
  MAIN,
  mainComposition,
  masterOf,
  masterScene,
  movedInLayout,
  savedTransforms,
  setLayerTransform,
  setPlacement,
  sizeInDesignPx,
  type GuideFamily,
} from '@smart-canvas/core';
import type { Frame, TransformHistory } from '@smart-canvas/core';
import { useCallback, useMemo } from 'react';
import { useBoard } from '../board/context';
import { confirmDelete } from '../board/LayerRow';
import { CanvasEditor } from './CanvasEditor';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';
import { MUTED_TEXT } from '../ui/tw';
import { FAMILY_LABEL, useOpenLayout } from '../board/MainNode';
import { SizeStrip } from './SizeStrip';
import { btn } from '../ui/button';

/** D82: a layout tab — its shape, its name, how many sizes follow it; the one open is lit. */
const TAB =
  'sc-layout-tab inline-flex h-32 cursor-pointer items-center gap-7 rounded-[10px] px-10 text-[12.5px] font-[650] whitespace-nowrap text-muted [background:none] [border:0] hover:text-fg aria-selected:bg-accent-soft aria-selected:text-accent pointer-coarse:h-40';

function Shape({ w, h }: { w: number; h: number }) {
  const k = 14 / Math.max(w, h);
  return <span className="inline-block flex-none rounded-[2px] border-[1.5px] border-solid border-current" style={{ width: Math.max(6, w * k), height: Math.max(6, h * k) }} aria-hidden="true" />;
}

export function MainEditor({ compositionId = MAIN, onClose }: { compositionId?: string; onClose: () => void }) {
  const { doc, run, readOnly, openOutputEditor } = useBoard();
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
  const histories = savedTransforms(main?.transforms, { width, height });
  // M1: a layer snaps to where it sits in the master's other layouts.
  const spotsOf = useCallback((id: string) => layerSpots(doc, main.id, id, main.id), [doc, main.id]);
  // D50: in the master's vertical / horizontal layout the layers are the master's — their order, wiring, lock,
  // visibility and deletion apply in all three layouts; only positions and sizes are this layout's.
  const rowsOf = masterOf(doc, main.id);
  // D82: the master's three layouts as tabs (switching keeps the editor and its selection), the sizes that follow
  // the open one, and whether a layer was moved in it.
  const rows = guideRows(doc, rowsOf);
  const family: GuideFamily = main.guide?.family ?? rows.find((r) => r.composition?.id === main.id)?.family ?? 'square';
  const openLayout = useOpenLayout(rowsOf);
  const users = rows.find((r) => r.family === family)?.outputs ?? [];
  const isLayout = !!main.guide;
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
          <span className="sc-layout-tabs inline-flex gap-2" role="tablist" aria-label="Layouts">
            {rows.map((r) => {
              const size = sizeInDesignPx(r.composition?.size ?? main.size);
              return (
                <button
                  key={r.family}
                  type="button"
                  role="tab"
                  className={TAB}
                  aria-selected={r.family === family}
                  disabled={readOnly && !r.composition}
                  onClick={() => r.family !== family && openLayout(r.family)}
                  title={`${FAMILY_LABEL[r.family]} layout · ${r.outputs.length} ${r.outputs.length === 1 ? 'size follows' : 'sizes follow'} it`}
                >
                  <Shape w={r.composition ? size.width : r.family === 'vertical' ? 10 : r.family === 'horizontal' ? 18 : 14} h={r.composition ? size.height : r.family === 'vertical' ? 16 : r.family === 'horizontal' ? 10 : 14} />
                  {FAMILY_LABEL[r.family]}
                  <span className="text-[11px] font-[550] opacity-80">{r.outputs.length}</span>
                </button>
              );
            })}
          </span>
          <span className={MUTED_TEXT}>
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
      layers={(selected, select) => <LayersPanel selected={selected} onSelect={select} compositionId={rowsOf} layoutId={isLayout ? main.id : undefined} />}
      props={(s) => (
        <>
          {isLayout && <FollowSquare layoutId={main.id} sourceId={s.id} label={FAMILY_LABEL[family]} />}
          {s.content.kind === 'text' ? <TextPanel key={s.id} source={{ ...s, content: s.content }} /> : null}
        </>
      )}
      stageFooter={
        users.length > 0 ? (
          <SizeStrip
            label={`Sizes that use the ${FAMILY_LABEL[family]} layout`}
            heading="Used by"
            outputIds={users.map((u) => u.id)}
            pickName={(label) => `Open Preview ${label}`}
            onPick={(id) => {
              onClose();
              openOutputEditor(id);
            }}
          />
        ) : null
      }
      onClose={onClose}
    />
  );
}

/** D82: where a layer sits in a Vertical or Horizontal layout — where Square puts it, or moved here (then it can follow Square again). */
function FollowSquare({ layoutId, sourceId, label }: { layoutId: string; sourceId: string; label: string }) {
  const { doc, run, readOnly } = useBoard();
  const moved = movedInLayout(doc, layoutId, sourceId);
  return (
    <section className="sc-follow grid gap-6 px-(--sp-3) pb-(--sp-2)" aria-label="Place in this layout">
      <p className={`m-0 text-[12px] ${moved ? 'text-warn' : 'text-muted'}`}>{moved ? `Moved in the ${label} layout: it no longer follows Square here.` : 'Follows Square: placed from where it sits on Square.'}</p>
      {moved && !readOnly && (
        <button type="button" className={`${btn('default', 'card-row')} sc-follow__reset justify-self-start`} onClick={() => run((d) => followMaster(d, layoutId, sourceId))}>
          Follow Square again
        </button>
      )}
    </section>
  );
}

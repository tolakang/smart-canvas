/**
 * Main preview editor (T3.2): place / move / resize / rotate layers on the master with react-moveable (D26),
 * snapping to the canvas edges, centre lines and other layers, and arrow-key nudging (1 design px, Shift 10).
 * Draws with the same OutputRenderer as export; edits write master.placements through the board (autosave).
 */
import { masterScene, setPlacement, type RenderScene } from '@smart-canvas/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import Moveable from 'react-moveable';
import { assetUrl } from '../api';
import { useBoard } from '../board/context';
import { OutputRenderer } from '../render/OutputRenderer';
import { fitScale, NUDGE_STEP, nudge, toNFrame, type Box } from './geometry';

const SNAP_DIRECTIONS = { top: true, left: true, bottom: true, right: true, center: true, middle: true };

export function MainEditor({ onClose }: { onClose: () => void }) {
  const { doc, run, readOnly, teamId } = useBoard();
  const stage = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 800, height: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Box | null>(null); // the selected box while a gesture is running
  const liveRef = useRef<Box | null>(null);

  const scene = useMemo(() => masterScene(doc), [doc]);
  const scale = fitScale(scene, area);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setArea({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // An input that left the scene (hidden, disconnected, deleted) can't stay selected.
  const selectedItem = scene.items.find((i) => i.sourceId === selected) ?? null;
  const selectedSource = doc.sources.find((s) => s.id === selected) ?? null;

  const boxNow: Box | null = selectedItem
    ? live ?? {
        x: selectedItem.frame.x * scale,
        y: selectedItem.frame.y * scale,
        w: selectedItem.frame.w * scale,
        h: selectedItem.frame.h * scale,
        rotation: selectedItem.frame.rotation ?? 0,
      }
    : null;

  // While dragging, draw the selected layer at its live box so the preview follows the pointer.
  const drawn: RenderScene = useMemo(() => {
    if (!live || !selected) return scene;
    return {
      ...scene,
      items: scene.items.map((i) =>
        i.sourceId === selected
          ? { ...i, frame: { x: live.x / scale, y: live.y / scale, w: live.w / scale, h: live.h / scale, ...(live.rotation ? { rotation: live.rotation } : {}) } }
          : i,
      ),
    };
  }, [scene, live, selected, scale]);

  const setGesture = (b: Box | null) => {
    liveRef.current = b;
    setLive(b);
  };
  const commit = useCallback(() => {
    const b = liveRef.current;
    if (b && selected) run((d) => setPlacement(d, selected, toNFrame(b, scene, scale)));
    setGesture(null);
  }, [run, selected, scene, scale]);

  // Arrow-key nudge and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else onClose();
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || !selected || !selectedItem || readOnly) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_STEP.shift : NUDGE_STEP.normal;
      const current = doc.master.placements[selected] ?? toNFrame({ x: selectedItem.frame.x, y: selectedItem.frame.y, w: selectedItem.frame.w, h: selectedItem.frame.h, rotation: selectedItem.frame.rotation ?? 0 }, scene, 1);
      run((d) => setPlacement(d, selected, nudge(current, (dir[0] ?? 0) * step, (dir[1] ?? 0) * step, scene)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedItem, readOnly, doc, run, scene, onClose]);

  // Click selects the front-most layer under the pointer; empty canvas clears the selection.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('.moveable-control-box') || t === control.current) return;
    const id = t.closest<HTMLElement>('[data-source-id]')?.dataset.sourceId ?? null;
    setSelected(id);
    setGesture(null);
  }

  const guidesV = [0, (scene.width * scale) / 2, scene.width * scale];
  const guidesH = [0, (scene.height * scale) / 2, scene.height * scale];
  // Other layers as snap targets, by selector (resolved by Moveable, scoped to this editor's canvas).
  const otherLayers = scene.items
    .filter((i) => i.sourceId !== selected)
    .map((i) => `.sc-editor__canvas .sc-render [data-source-id="${CSS.escape(i.sourceId)}"]`);
  const keepRatio = selectedSource?.kind === 'image' || selectedSource?.kind === 'vector';

  return (
    <div className="sc-editor-screen" role="dialog" aria-label="Main preview editor">
      <header className="sc-board__bar">
        <strong>Main preview</strong>
        <span className="sc-muted">
          {doc.master.size.width} × {doc.master.size.height} {doc.master.size.unit}
        </span>
        {selectedSource && (
          <span className="sc-muted" data-testid="selection">
            Selected: {selectedSource.label}
          </span>
        )}
        <span className="sc-muted sc-editor__hint">
          {readOnly ? 'View only' : 'Drag to move · handles resize/rotate · arrows nudge (Shift ×10) · Esc'}
        </span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="sc-editor__stage" ref={stage}>
        <div className="sc-editor__canvas" ref={canvasEl} onPointerDown={onPointerDown} style={{ width: scene.width * scale, height: scene.height * scale }}>
          <OutputRenderer scene={drawn} sources={doc.sources} assetUrl={(id) => assetUrl(teamId, id)} scale={scale} mode="preview" />
          {boxNow && (
            <div
              ref={control}
              className="sc-editor__target"
              data-testid="selection-box"
              style={{ width: boxNow.w, height: boxNow.h, transform: `translate(${boxNow.x}px, ${boxNow.y}px) rotate(${boxNow.rotation}deg)` }}
            />
          )}
          {boxNow && !readOnly && (
            <Moveable
              key={selected ?? ''}
              target={control}
              draggable
              resizable
              rotatable
              keepRatio={keepRatio}
              origin={false}
              throttleDrag={0}
              throttleResize={0}
              throttleRotate={0}
              snappable
              snapThreshold={6}
              isDisplaySnapDigit
              snapDirections={SNAP_DIRECTIONS}
              elementSnapDirections={SNAP_DIRECTIONS}
              verticalGuidelines={guidesV}
              horizontalGuidelines={guidesH}
              elementGuidelines={otherLayers}
              onDragStart={(e) => e.set([boxNow.x, boxNow.y])}
              onDrag={(e) => setGesture({ ...(liveRef.current ?? boxNow), x: e.beforeTranslate[0] ?? 0, y: e.beforeTranslate[1] ?? 0 })}
              onDragEnd={commit}
              onResizeStart={(e) => {
                e.setOrigin(['%', '%']);
                if (e.dragStart) e.dragStart.set([boxNow.x, boxNow.y]);
              }}
              onResize={(e) =>
                setGesture({
                  ...(liveRef.current ?? boxNow),
                  w: e.width,
                  h: e.height,
                  x: e.drag.beforeTranslate[0] ?? 0,
                  y: e.drag.beforeTranslate[1] ?? 0,
                })
              }
              onResizeEnd={commit}
              onRotateStart={(e) => e.set(boxNow.rotation)}
              onRotate={(e) => setGesture({ ...(liveRef.current ?? boxNow), rotation: e.beforeRotate })}
              onRotateEnd={commit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

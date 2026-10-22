/**
 * The canvas editor shared by the master preview (T3.2) and the output editors (T5.1): select, move, resize,
 * rotate and skew layers with the transform box (D36, Affinity-style: drag an edge along itself to skew;
 * touch: hold, then drag; double-click / double-tap a handle to undo what it changed), moves snapping to the
 * canvas edges, centre lines and other layers, arrow-key nudging (1 design px, Shift 10). Draws with the same OutputRenderer as export. What an edit
 * writes is the caller's: placements on the main composition, overrides for an output.
 * Figma-style workspace (T10.1): toolbar with Move / Hand tools, pan (Space or H + drag, wheel), zoom at the
 * pointer (Ctrl/⌘ + wheel) and Figma's zoom keys, a size badge on the selection, and a Design panel with
 * X / Y / W / H / rotation.
 */
import { frameTransform, layerSources, pictureAspect, type Frame, type InputSource, type RenderScene } from '@smart-canvas/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { assetUrl } from '../api';
import { useBoard } from '../board/context';
import { OutputRenderer } from '../render/OutputRenderer';
import { DesignPanel } from './DesignPanel';
import { fitScale, NUDGE_STEP, resetRotation, resetTransform } from './geometry';
import { frameOfState, sameFrame, snapMove, snapTargets, syncDoc } from './transform/frame';
import type { TransformDoc } from './transform/math';
import { TransformBox } from './transform/transform-box';

/** Moves snap within this many screen px. */
const SNAP_PX = 6;
const MIN_SCALE = 0.02;
const MAX_SCALE = 64;

type Tool = 'move' | 'hand';
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export interface CanvasEditorProps {
  label: string;
  title: ReactNode;
  scene: RenderScene;
  /** Writes a layer's new frame (design px of `scene`) where this editor stores it, with its history when known. */
  onCommit: (sourceId: string, frame: Frame, history?: TransformDoc) => void;
  /** Delete / Backspace on the selected layer (master preview: as its row's trash button; output: hide it there). */
  onDelete?: (sourceId: string) => void;
  /** Saved transform histories for this scene (D41), so resets work after a reload. Absent = none. */
  histories?: Record<string, TransformDoc>;
  /** Called when a layer's transform history changes (a gesture end, a reset, or an external frame edit). */
  onHistory?: (sourceId: string, history: TransformDoc) => void;
  /** Left side panel (layers). */
  layers: (selected: string | null, select: (id: string | null) => void) => ReactNode;
  /** Extra panels for the selected input, under its position and size in the Design panel (text style, overrides). */
  props?: (source: InputSource) => ReactNode;
  onClose: () => void;
}

export function CanvasEditor({ label, title, scene, onCommit, onDelete, histories, onHistory, layers, props: sidePanel, onClose }: CanvasEditorProps) {
  const { doc, readOnly, teamId, layoutDeps } = useBoard();
  // T12.5: rows can be processes; they draw (and select) as their effective layer.
  const layerList = useMemo(() => layerSources(doc), [doc]);
  const stage = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const box = useRef<TransformBox | null>(null);
  /** Each layer's transform history this session: double-clicks undo exactly what a handle did. */
  const history = useRef(new Map<string, TransformDoc>());
  /** The saved histories and the save callback, always the latest render's (the box reads them lazily). */
  const historiesRef = useRef(histories);
  const onHistoryRef = useRef(onHistory);
  useLayoutEffect(() => {
    historiesRef.current = histories;
    onHistoryRef.current = onHistory;
  });
  /** The press that just selected a new layer: it goes on as a move of it (T8.6). */
  const pendingPress = useRef<globalThis.PointerEvent | null>(null);
  // zoom: × the fit scale; pan: screen px from the centred position.
  const [{ zoom, pan }, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [tool, setTool] = useState<Tool>('move');
  const [space, setSpace] = useState(false);
  const [ratioLock, setRatioLock] = useState<{ id: string; on: boolean } | null>(null); // else the kind's default
  const panFrom = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [area, setArea] = useState({ width: 800, height: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Frame | null>(null); // the selected frame while a gesture is running

  const fit = fitScale(scene, area);
  const scale = fit * zoom;
  const hand = tool === 'hand' || space;
  const canvasLeft = (area.width - scene.width * scale) / 2 + pan.x;
  const canvasTop = (area.height - scene.height * scale) / 2 + pan.y;

  /** Zoom to `to(current scale)`, keeping the design point under `at` (client px; default the stage centre) still. */
  const zoomAt = useCallback(
    (to: (s: number) => number, at?: { x: number; y: number }) => {
      const r = stage.current?.getBoundingClientRect();
      setLive(null);
      setView(({ zoom: z, pan: p }) => {
        const s = fit * z;
        const s2 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, to(s)));
        const px = at && r ? at.x - r.left : area.width / 2;
        const py = at && r ? at.y - r.top : area.height / 2;
        const left = (area.width - scene.width * s) / 2 + p.x;
        const top = (area.height - scene.height * s) / 2 + p.y;
        return {
          zoom: s2 / fit,
          pan: {
            x: px - ((px - left) / s) * s2 - (area.width - scene.width * s2) / 2,
            y: py - ((py - top) / s) * s2 - (area.height - scene.height * s2) / 2,
          },
        };
      });
    },
    [fit, area, scene.width, scene.height],
  );

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setArea({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // An input that left the scene (hidden, disconnected, deleted) can't stay selected.
  const selectedItem = scene.items.find((i) => i.sourceId === selected) ?? null;
  const selectedSource = layerList.find((s) => s.id === selected) ?? null;
  // What a click would grab (T8.6): an outline on the layer under the pointer.
  const hoveredItem = hovered && hovered !== selected ? (scene.items.find((i) => i.sourceId === hovered) ?? null) : null;

  /** The selected layer's frame now (design px): live during a gesture, else as stored. */
  const frameNow: Frame | null = selectedItem ? (live ?? selectedItem.frame) : null;

  // While dragging, draw the selected layer at its live frame so the preview follows the pointer.
  const drawn: RenderScene = useMemo(() => {
    if (!live || !selected) return scene;
    return { ...scene, items: scene.items.map((i) => (i.sourceId === selected ? { ...i, frame: live } : i)) };
  }, [scene, live, selected]);

  // Selecting from a side panel only changes state.
  const select = useCallback((id: string | null) => {
    setSelected(id);
    setLive(null);
  }, []);

  // Arrow-key nudge and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '=' || e.key === '+')) return (e.preventDefault(), zoomAt((s) => s * 1.25));
      if (mod && e.key === '-') return (e.preventDefault(), zoomAt((s) => s / 1.25));
      if ((mod && e.key === '0') || (e.shiftKey && e.code === 'Digit0')) return (e.preventDefault(), zoomAt(() => 1));
      if (e.shiftKey && e.code === 'Digit1') return (e.preventDefault(), setView({ zoom: 1, pan: { x: 0, y: 0 } }));
      if (mod || e.altKey) return;
      if (e.key === ' ') return (e.preventDefault(), setSpace(true));
      if (e.key === 'v' || e.key === 'V') return setTool('move');
      if (e.key === 'h' || e.key === 'H') return setTool('hand');
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else onClose();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && onDelete && !readOnly) {
        e.preventDefault();
        onDelete(selected);
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || !selected || !selectedItem || readOnly) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_STEP.shift : NUDGE_STEP.normal;
      const f = selectedItem.frame;
      onCommit(selected, { ...f, x: f.x + (dir[0] ?? 0) * step, y: f.y + (dir[1] ?? 0) * step });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpace(false);
    };
    const onBlur = () => {
      setSpace(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selected, selectedItem, readOnly, onCommit, onDelete, onClose, zoomAt]);

  /**
   * The layers under a point, front first (T8.6). Looks through the selection box and its handles,
   * so a click inside the selected box can still pick a layer in front of it or behind it.
   */
  const layersAt = (x: number, y: number): string[] => {
    const ids: string[] = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (!canvasEl.current?.contains(el)) continue;
      const id = (el as HTMLElement).closest<HTMLElement>('.sc-render [data-source-id]')?.dataset.sourceId;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  // Press on a layer selects the front-most one under the pointer and drags it in the same gesture (the new
  // transform box picks the press up as a move). Alt+press picks the next layer behind the selected one.
  // Empty canvas clears the selection. Handles keep resizing / rotating / skewing.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('.tb-handle') || t.closest('.sc-editor__resets')) return;
    const under = layersAt(e.clientX, e.clientY);
    let id = under[0] ?? null;
    if (e.altKey && selected && under.includes(selected)) id = under[(under.indexOf(selected) + 1) % under.length] ?? id;
    if (id === selected) return; // the transform box drags the current selection
    setSelected(id);
    setLive(null);
    pendingPress.current = id && !readOnly ? e.nativeEvent : null;
  }

  // Wheel pans (Shift: sideways); Ctrl/⌘ + wheel (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) return zoomAt((s) => s * Math.exp(-e.deltaY / 300), { x: e.clientX, y: e.clientY });
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      setView((v) => ({ ...v, pan: { x: v.pan.x - dx, y: v.pan.y - dy } }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Hand tool / Space: drag anywhere on the stage to pan.
  const panHandlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      panFrom.current = { x: e.clientX, y: e.clientY, pan };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const f = panFrom.current;
      if (f) setView((v) => ({ ...v, pan: { x: f.pan.x + e.clientX - f.x, y: f.pan.y + e.clientY - f.y } }));
    },
    onPointerUp: () => {
      panFrom.current = null;
    },
  };

  // Moves snap to the canvas edges and centre lines and to the other layers' edges and centres.
  const targets = useMemo(() => snapTargets(scene, scene.items.filter((i) => i.sourceId !== selected).map((i) => i.frame)), [scene, selected]);
  const lockRatio = ratioLock?.id === selected ? ratioLock.on : selectedSource?.kind === 'image' || selectedSource?.kind === 'vector';

  // What the transform box's callbacks read: always this render's values, without re-creating the box.
  const selectedFrame = selectedItem?.frame ?? null;
  // A fitted picture's own proportions: resets of its stretch / scale handles end at them.
  const aspect = selectedFrame?.fitted && selectedSource ? pictureAspect(selectedSource, layoutDeps?.assets ?? {}) : undefined;
  const latest = useRef({ scale, onCommit, lockRatio, targets, frame: selectedFrame, aspect });
  useLayoutEffect(() => {
    latest.current = { scale, onCommit, lockRatio, targets, frame: selectedFrame, aspect };
  });

  // One transform box per selected layer, picking up its history from this session.
  const editable = !!selectedFrame && !readOnly;
  useLayoutEffect(() => {
    const frame = latest.current.frame;
    if (!selected || !editable || !frame || !canvasEl.current || !control.current) return;
    const id = selected;
    // A saved history from the project (D41) starts the session; otherwise the frame's own.
    const start = syncDoc(history.current.get(id) ?? historiesRef.current?.[id], frame);
    history.current.set(id, start);
    const b = new TransformBox(canvasEl.current, control.current, start, {
      getScale: () => latest.current.scale,
      flip: false,
      proportional: (shift) => latest.current.lockRatio || shift,
      aspect: () => latest.current.aspect,
      snapMove: (moved) => snapMove(moved, latest.current.targets, SNAP_PX / latest.current.scale),
      onChange: (state, info) => {
        // D37: the drawn frame stays fitted while it's dragged, so a stretch shows live (not only on release).
        const f = { ...frameOfState(state), ...(latest.current.frame?.fitted ? { fitted: true as const } : {}) };
        if (info.phase === 'move') setLive(f);
        if (info.phase !== 'end' && info.phase !== 'reset') return;
        history.current.set(id, info.doc);
        setLive(null);
        const stored = latest.current.frame;
        if (!stored || !sameFrame(stored, f, 1e-6)) latest.current.onCommit(id, f, info.doc);
        else onHistoryRef.current?.(id, info.doc);
      },
    });
    box.current = b;
    const press = pendingPress.current;
    pendingPress.current = null;
    if (press) b.beginDrag(press, 'body');
    return () => {
      b.destroy();
      box.current = null;
    };
  }, [selected, editable]);

  // A frame changed from outside a gesture (typed values, nudge, undo): bring the box and its history along.
  useLayoutEffect(() => {
    const b = box.current;
    if (!b || !selected || !selectedFrame || b.isBusy()) return;
    const doc = syncDoc(b.getDoc(), selectedFrame);
    if (doc !== b.getDoc()) {
      b.setDoc(doc);
      history.current.set(selected, doc);
      // Typed values, nudges and undo change the shape outside the box: keep the saved history in step.
      onHistoryRef.current?.(selected, doc);
    }
  }, [selected, selectedFrame]);

  // Zoom changes the box's screen size, not its state.
  useLayoutEffect(() => {
    box.current?.refresh();
  }, [scale]);

  const pct = Math.round(scale * 100);
  const toolButton = (t: Tool, name: string, key: string, icon: ReactNode) => (
    <button type="button" className="sc-fig__tool" aria-label={`${name} (${key})`} title={`${name} (${key})`} aria-pressed={tool === t} onClick={() => setTool(t)}>
      {icon}
    </button>
  );

  return (
    <div className="sc-editor-screen sc-fig" role="dialog" aria-label={label}>
      <header className="sc-fig__bar">
        <span className="sc-fig__tools" role="group" aria-label="Tools">
          {toolButton(
            'move',
            'Move tool',
            'V',
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 2l10 5.5-4.3 1.2L6.5 13z" fill="currentColor" />
            </svg>,
          )}
          {toolButton(
            'hand',
            'Hand tool',
            'H',
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <path d="M5 8V3.5a1 1 0 012 0V7m0-4.5v-1a1 1 0 012 0V7m0-4a1 1 0 012 0v4.5m0-2a1 1 0 012 0V10a4.5 4.5 0 01-4.5 4.5H8a4 4 0 01-3.2-1.6L2.6 10a1 1 0 011.6-1.2L5 9.8" />
            </svg>,
          )}
        </span>
        <span className="sc-fig__title">{title}</span>
        {selectedSource && (
          <span className="sc-fig__muted sc-fig__selection" data-testid="selection">
            Selected: {selectedSource.label}
          </span>
        )}
        {readOnly && <span className="sc-fig__muted">View only</span>}
        <span className="sc-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl/⌘ −)" onClick={() => zoomAt((z) => z / 1.25)}>
            −
          </button>
          <span className="sc-zoom__value" aria-label="Zoom level">
            {pct}%
          </span>
          <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl/⌘ =)" onClick={() => zoomAt((z) => z * 1.25)}>
            +
          </button>
          <button type="button" title="Zoom to fit (Shift+1)" onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })}>
            Fit
          </button>
          <button type="button" className="sc-zoom__actual" title="Zoom to 100% (Shift+0)" onClick={() => zoomAt(() => 1)}>
            100%
          </button>
        </span>
        <button type="button" className="sc-fig__close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="sc-editor__body">
        {layers(selected, select)}
        <div
          className={`sc-editor__stage${hand ? ' sc-editor__stage--hand' : ''}`}
          ref={stage}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) select(null); // the empty stage around the canvas
          }}
        >
          <div className="sc-editor__canvas" ref={canvasEl}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => e.buttons === 0 && setHovered(layersAt(e.clientX, e.clientY)[0] ?? null)}
            onPointerLeave={() => setHovered(null)}
            style={{ left: canvasLeft, top: canvasTop, width: scene.width * scale, height: scene.height * scale }}>
            <OutputRenderer scene={drawn} sources={layerList} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} scale={scale} mode="preview" />
            {hoveredItem && !live && (
              <div
                className="sc-editor__hover"
                aria-hidden="true"
                style={{
                  width: hoveredItem.frame.w * scale,
                  height: hoveredItem.frame.h * scale,
                  transform: `translate(${hoveredItem.frame.x * scale}px, ${hoveredItem.frame.y * scale}px) ${frameTransform(hoveredItem.frame)}`,
                }}
              />
            )}
            {frameNow && editable && <div ref={control} className="sc-editor__target" data-testid="selection-box" />}
            {frameNow && !editable && (
              // View only: an outline, no handles.
              <div
                className="sc-editor__target"
                data-testid="selection-box"
                style={{
                  width: frameNow.w * scale,
                  height: frameNow.h * scale,
                  transform: `translate(${frameNow.x * scale}px, ${frameNow.y * scale}px) ${frameTransform(frameNow)}`,
                }}
              />
            )}
            {frameNow && (
              <div
                className="sc-editor__size"
                data-testid="selection-size"
                style={{ left: (frameNow.x + frameNow.w / 2) * scale, top: (frameNow.y + frameNow.h) * scale + 8 }}
              >
                {Math.round(frameNow.w)} × {Math.round(frameNow.h)}
              </div>
            )}
            {frameNow && editable && selected && (frameNow.rotation || frameNow.shear) && (
              <div
                className="sc-editor__resets"
                role="group"
                aria-label="Reset transform"
                style={{ left: frameNow.x * scale + 4, top: frameNow.y * scale + 4 }}
              >
                {frameNow.rotation ? (
                  <button
                    type="button"
                    aria-label="Reset rotation"
                    title="Reset rotation"
                    onClick={() => onCommit(selected, resetRotation(frameNow))}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M3 8a5 5 0 105-5" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                ) : null}
                {frameNow.shear ? (
                  <button
                    type="button"
                    aria-label="Reset transform"
                    title="Reset rotation and skew"
                    onClick={() => onCommit(selected, resetTransform(frameNow))}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" />
                      <path d="M6 6l4 4M10 6l-4 4" />
                    </svg>
                  </button>
                ) : null}
              </div>
            )}
          </div>
          {hand && <div className="sc-editor__pan" data-testid="pan-surface" {...panHandlers} />}
        </div>
        <DesignPanel
          scene={scene}
          source={selectedItem ? selectedSource : null}
          frame={frameNow}
          lockRatio={lockRatio}
          onLockRatio={(on) => selected && setRatioLock({ id: selected, on })}
          onCommit={(f) => selected && onCommit(selected, { x: f.x, y: f.y, w: f.w, h: f.h, ...(f.rotation ? { rotation: f.rotation } : {}), ...(f.shear ? { shear: f.shear } : {}) })}
          readOnly={readOnly}
        >
          {selectedSource && sidePanel?.(selectedSource)}
        </DesignPanel>
      </div>
    </div>
  );
}

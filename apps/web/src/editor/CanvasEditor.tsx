/**
 * The canvas editor shared by the master preview (T3.2) and the output editors (T5.1): select, move, resize,
 * rotate and skew layers with the transform box (D36, Affinity-style: drag an edge along itself to skew;
 * double-click / double-tap a handle to undo what it changed), moves and (N7) resizes snapping to the
 * canvas edges, centre lines and other layers, arrow-key nudging (1 design px, Shift 10). Draws with the same OutputRenderer as export. What an edit
 * writes is the caller's: placements on the main composition, overrides for an output.
 * Figma-style workspace (T10.1): toolbar with Move / Hand tools, pan (Space or H + drag, wheel), zoom at the
 * pointer (Ctrl/⌘ + wheel) and Figma's zoom keys, a size badge on the selection, and a Design panel with
 * X / Y / W / H / rotation.
 * Touch (D58, Q7; supersedes D36's hold): one finger on empty canvas or a layer not selected moves the canvas; a tap
 * selects (tapping the selected layer again picks the one behind it); the selected layer and its handles drag at
 * once; two fingers pinch and pan anywhere; a double-tap on empty canvas fits.
 */
import { frameTransform, layerSources, pictureAspect, type Frame, type InputSource, type NFrame, type RenderScene } from '@smart-canvas/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { assetUrl } from '../api';
import { useBoard } from '../board/context';
import { usePinch } from '../board/pinch';
import { OutputRenderer } from '../render/OutputRenderer';
import { DesignPanel } from './DesignPanel';
import { fitScale, NUDGE_STEP, resetRotation, resetTransform } from './geometry';
import { frameOfState, sameFrame, snapMove, snapResize, snapTargets, syncDoc } from './transform/frame';
import type { TransformDoc } from './transform/math';
import { TransformBox } from './transform/transform-box';

/** Moves and resizes snap within this many screen px. */
const SNAP_PX = 6;
/** Touch: a finger that moves less than this is a tap; two taps closer in time and place are a double-tap. */
const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 300;
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
  /** M1: where a layer sits in the other layouts (fractions of their canvases); it snaps to those spots too. */
  spotsOf?: (layerId: string) => { label: string; frame: NFrame }[];
  /** Extra panels for the selected input, under its position and size in the Design panel (text style, overrides). */
  props?: (source: InputSource) => ReactNode;
  onClose: () => void;
}

export function CanvasEditor({ label, title, scene, onCommit, onDelete, histories, onHistory, layers, spotsOf, props: sidePanel, onClose }: CanvasEditorProps) {
  const { doc, readOnly, teamId, layoutDeps } = useBoard();
  // The layers the canvas draws (a Headline card's unused language hidden, D44).
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
  /** D58: one finger on the canvas (not on the selected layer's box): a tap, or a pan once it moves. */
  const touchPan = useRef<{ id: number; x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null);
  /** The last tap on empty canvas, for a double-tap to fit. */
  const emptyTap = useRef<{ x: number; y: number; time: number } | null>(null);
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && onDelete && !readOnly && !selectedSource?.locked) {
        e.preventDefault();
        onDelete(selected);
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || !selected || !selectedItem || readOnly || selectedSource?.locked) return;
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
  }, [selected, selectedItem, selectedSource, readOnly, onCommit, onDelete, onClose, zoomAt]);

  /**
   * The layers under a point, front first (T8.6). Looks through the selection box and its handles,
   * so a click inside the selected box can still pick a layer in front of it or behind it.
   */
  const layersAt = (x: number, y: number): string[] => {
    const ids: string[] = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (!canvasEl.current?.contains(el)) continue;
      const id = (el as HTMLElement).closest<HTMLElement>('.sc-render [data-source-id]')?.dataset.sourceId;
      // D50: a locked layer is not picked on the canvas; a press goes through to the one behind it.
      if (id && !ids.includes(id) && !layerList.find((s) => s.id === id)?.locked) ids.push(id);
    }
    return ids;
  };

  // Press on a layer selects the front-most one under the pointer and drags it in the same gesture (the new
  // transform box picks the press up as a move). Alt+press picks the next layer behind the selected one.
  // Empty canvas clears the selection. Handles keep resizing / rotating / skewing.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') return; // D58: a tap selects, a drag moves the canvas (onTouchDown)
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

  /** D58: a finger that lands on the canvas or around it, not on the selected layer's box or its buttons. */
  function onTouchDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' || !e.isPrimary || hand) return;
    if ((e.target as HTMLElement).closest('.tb-handle, .tb-target, .sc-editor__resets')) return; // the box's own drag
    e.currentTarget.setPointerCapture(e.pointerId);
    touchPan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan, moved: false };
  }
  function onTouchMove(e: PointerEvent<HTMLDivElement>) {
    const t = touchPan.current;
    if (!t || e.pointerId !== t.id) return;
    if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_SLOP_PX) return;
    t.moved = true;
    setView((v) => ({ ...v, pan: { x: t.pan.x + e.clientX - t.x, y: t.pan.y + e.clientY - t.y } }));
  }
  function onTouchUp(e: PointerEvent<HTMLDivElement>) {
    const t = touchPan.current;
    if (!t || e.pointerId !== t.id) return;
    touchPan.current = null;
    if (t.moved) return;
    // A tap: the front-most layer under the finger, or nothing (a second tap on empty canvas soon after fits).
    const id = layersAt(e.clientX, e.clientY)[0] ?? null;
    select(id);
    if (id) return (emptyTap.current = null);
    const prev = emptyTap.current;
    const now = performance.now();
    if (prev && now - prev.time <= DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= 24) {
      emptyTap.current = null;
      setView({ zoom: 1, pan: { x: 0, y: 0 } });
    } else emptyTap.current = { x: e.clientX, y: e.clientY, time: now };
  }

  // D58: two fingers anywhere on the stage pinch-zoom (about their midpoint) and pan; a drag under way stops.
  const view = useRef({ fit, area, scene, canvasLeft, canvasTop, scale });
  useLayoutEffect(() => {
    view.current = { fit, area, scene, canvasLeft, canvasTop, scale };
  });
  const pinchTarget = useCallback(
    () => ({
      getViewport: () => ({ x: view.current.canvasLeft, y: view.current.canvasTop, zoom: view.current.scale }),
      setViewport: ({ x, y, zoom: s }: { x: number; y: number; zoom: number }) => {
        const { fit: f, area: a, scene: sc } = view.current;
        setLive(null);
        setView({ zoom: s / f, pan: { x: x - (a.width - sc.width * s) / 2, y: y - (a.height - sc.height * s) / 2 } });
      },
    }),
    [],
  );
  const onPinchStart = useCallback(() => {
    touchPan.current = null;
    box.current?.cancel();
  }, []);
  usePinch(stage, pinchTarget, { min: MIN_SCALE, max: MAX_SCALE }, onPinchStart);

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

  // M1: the selected layer's spots in the other layouts, mapped onto this canvas by relative position.
  const spots = useMemo(
    () =>
      selected && spotsOf
        ? spotsOf(selected).map(({ label: from, frame: n }) => ({
            from,
            frame: { x: n.x * scene.width, y: n.y * scene.height, w: n.w * scene.width, h: n.h * scene.height, ...(n.rotation ? { rotation: n.rotation } : {}), ...(n.shear ? { shear: n.shear } : {}) } as Frame,
          }))
        : [],
    [selected, spotsOf, scene],
  );
  // Moves and (N7) resizes snap to the canvas edges and centre lines, to the other layers' edges and centres,
  // and (M1) to the selected layer's spots in the other layouts.
  const targets = useMemo(() => snapTargets(scene, [...scene.items.filter((i) => i.sourceId !== selected).map((i) => i.frame), ...spots.map((g) => g.frame)]), [scene, selected, spots]);
  const lockRatio = ratioLock?.id === selected ? ratioLock.on : selectedSource?.kind === 'image' || selectedSource?.kind === 'vector';

  // What the transform box's callbacks read: always this render's values, without re-creating the box.
  const selectedFrame = selectedItem?.frame ?? null;
  // A fitted picture's own proportions: resets of its stretch / scale handles end at them.
  const aspect = selectedFrame?.fitted && selectedSource ? pictureAspect(selectedSource, layoutDeps?.assets ?? {}) : undefined;
  const latest = useRef({ scale, onCommit, lockRatio, targets, frame: selectedFrame, aspect });
  const layersAtRef = useRef(layersAt);
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    latest.current = { scale, onCommit, lockRatio, targets, frame: selectedFrame, aspect };
    layersAtRef.current = layersAt;
    selectRef.current = select;
  });

  // One transform box per selected layer, picking up its history from this session.
  const editable = !!selectedFrame && !readOnly && !selectedSource?.locked;
  useLayoutEffect(() => {
    const frame = latest.current.frame;
    if (!selected || !editable || !frame || !canvasEl.current || !control.current) return;
    const id = selected;
    // A saved history from the project (D41) starts the session; otherwise the frame's own.
    const start = syncDoc(history.current.get(id) ?? historiesRef.current?.[id], frame);
    history.current.set(id, start);
    const b = new TransformBox(canvasEl.current, control.current, start, {
      // D58 (Q7): the selected layer and its handles drag at once on touch; a finger anywhere else moves the canvas.
      longPressMs: 0,
      // Touch: tapping the selected layer again picks the one behind it (Alt+click with a mouse).
      onTap: (handle, at, pointerType) => {
        if (handle !== 'body' || pointerType !== 'touch') return;
        const under = layersAtRef.current(at.x, at.y);
        if (under.length > 1 && under.includes(id)) selectRef.current(under[(under.indexOf(id) + 1) % under.length] ?? id);
      },
      getScale: () => latest.current.scale,
      flip: false,
      proportional: (shift) => latest.current.lockRatio || shift,
      aspect: () => latest.current.aspect,
      snapMove: (moved) => snapMove(moved, latest.current.targets, SNAP_PX / latest.current.scale),
      snapResize: (resize, at) => snapResize(resize, at, latest.current.targets, SNAP_PX / latest.current.scale),
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
            if (e.pointerType === 'touch') return onTouchDown(e);
            if (e.target === e.currentTarget) select(null); // the empty stage around the canvas
          }}
          onPointerMove={onTouchMove}
          onPointerUp={onTouchUp}
          onPointerCancel={() => (touchPan.current = null)}
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
            {live &&
              spots.map((g) => (
                <div
                  key={g.from}
                  className="sc-editor__spot"
                  data-testid="layout-spot"
                  aria-hidden="true"
                  style={{ width: g.frame.w * scale, height: g.frame.h * scale, transform: `translate(${g.frame.x * scale}px, ${g.frame.y * scale}px) ${frameTransform(g.frame)}` }}
                >
                  <span>{g.from}</span>
                </div>
              ))}
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

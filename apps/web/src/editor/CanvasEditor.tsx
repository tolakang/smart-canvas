/**
 * The canvas editor shared by the main preview (T3.2) and the output editors (T5.1): select, move, resize
 * and rotate layers with react-moveable (D26), snapping to the canvas edges, centre lines and other layers,
 * arrow-key nudging (1 design px, Shift 10). Draws with the same OutputRenderer as export. What an edit
 * writes is the caller's: placements on the main composition, overrides for an output.
 * Figma-style workspace (T10.1): toolbar with Move / Hand tools, pan (Space or H + drag, wheel), zoom at the
 * pointer (Ctrl/⌘ + wheel) and Figma's zoom keys, a size badge on the selection, and a Design panel with
 * X / Y / W / H / rotation.
 */
import { layerSources, type Frame, type InputSource, type RenderScene } from '@smart-canvas/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import Moveable from 'react-moveable';
import { assetUrl } from '../api';
import { useBoard } from '../board/context';
import { OutputRenderer } from '../render/OutputRenderer';
import { DesignPanel } from './DesignPanel';
import { fitScale, NUDGE_STEP, type Box } from './geometry';

const SNAP_DIRECTIONS = { top: true, left: true, bottom: true, right: true, center: true, middle: true };
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
  /** Writes a layer's new frame (design px of `scene`) where this editor stores it. */
  onCommit: (sourceId: string, frame: Frame) => void;
  /** Left side panel (layers). */
  layers: (selected: string | null, select: (id: string | null) => void) => ReactNode;
  /** Extra panels for the selected input, under its position and size in the Design panel (text style, overrides). */
  props?: (source: InputSource) => ReactNode;
  onClose: () => void;
}

export function CanvasEditor({ label, title, scene, onCommit, layers, props: sidePanel, onClose }: CanvasEditorProps) {
  const { doc, readOnly, teamId, layoutDeps } = useBoard();
  // T12.5: rows can be processes; they draw (and select) as their effective layer.
  const layerList = useMemo(() => layerSources(doc), [doc]);
  const stage = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const moveable = useRef<Moveable>(null);
  /** The current press just selected a new layer: its mousedown starts a drag of it (T8.6). */
  const dragOnPress = useRef(false);
  // zoom: × the fit scale; pan: screen px from the centred position.
  const [{ zoom, pan }, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [tool, setTool] = useState<Tool>('move');
  const [space, setSpace] = useState(false);
  const [shift, setShift] = useState(false);
  const [ratioLock, setRatioLock] = useState<{ id: string; on: boolean } | null>(null); // else the kind's default
  const panFrom = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [area, setArea] = useState({ width: 800, height: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Box | null>(null); // the selected box while a gesture is running
  const liveRef = useRef<Box | null>(null);

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

  const boxNow: Box | null = selectedItem
    ? live ?? {
        x: selectedItem.frame.x * scale,
        y: selectedItem.frame.y * scale,
        w: selectedItem.frame.w * scale,
        h: selectedItem.frame.h * scale,
        rotation: selectedItem.frame.rotation ?? 0,
      }
    : null;

  // Moveable measures its target only on gestures: re-measure when the box changes from outside one (typed
  // X / Y / W / H, arrow nudge, undo, zoom, pan).
  const [bx, by, bw, bh, br] = boxNow ? [boxNow.x, boxNow.y, boxNow.w, boxNow.h, boxNow.rotation] : [];
  useLayoutEffect(() => {
    if (!liveRef.current) moveable.current?.updateRect();
  }, [bx, by, bw, bh, br, pan]);

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

  // Selecting from a side panel only changes state (gestures always end by clearing liveRef).
  const select = useCallback((id: string | null) => {
    setSelected(id);
    setLive(null);
  }, []);

  const setGesture = (b: Box | null) => {
    liveRef.current = b;
    setLive(b);
  };
  /**
   * During a gesture the selection box must change size/position at once: Moveable measures it between
   * events, and a React render comes too late (resizing then snapped back every other event, T8.6).
   */
  const moveTo = (b: Box) => {
    const el = control.current;
    if (el) {
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
      el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rotation}deg)`;
    }
    setGesture(b);
  };
  const commit = useCallback(() => {
    const b = liveRef.current;
    if (b && selected) onCommit(selected, { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale, ...(b.rotation ? { rotation: b.rotation } : {}) });
    setGesture(null);
  }, [onCommit, selected, scale]);

  // Arrow-key nudge and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setShift(e.shiftKey);
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
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || !selected || !selectedItem || readOnly) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_STEP.shift : NUDGE_STEP.normal;
      const f = selectedItem.frame;
      onCommit(selected, { ...f, x: f.x + (dir[0] ?? 0) * step, y: f.y + (dir[1] ?? 0) * step });
    };
    const onUp = (e: KeyboardEvent) => {
      setShift(e.shiftKey);
      if (e.key === ' ') setSpace(false);
    };
    const onBlur = () => {
      setSpace(false);
      setShift(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selected, selectedItem, readOnly, onCommit, onClose, zoomAt]);

  /**
   * The layers under a point, front first (T8.6). Looks through the selection box and Moveable's handles,
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
  // selection box is under the pointer when the browser's mousedown follows). Alt+press picks the next layer
  // behind the selected one. Empty canvas clears the selection. Handles keep resizing/rotating.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('.moveable-control-box') && !t.classList.contains('moveable-area')) return;
    const under = layersAt(e.clientX, e.clientY);
    let id = under[0] ?? null;
    if (e.altKey && selected && under.includes(selected)) id = under[(under.indexOf(selected) + 1) % under.length] ?? id;
    if (id === selected) return; // Moveable drags the current selection
    setSelected(id);
    setGesture(null);
    dragOnPress.current = !!id && !readOnly;
  }

  // The browser's mousedown follows the pointerdown that selected a layer; by then its Moveable is mounted,
  // so the same press goes on as a drag of the new selection.
  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (!dragOnPress.current) return;
    dragOnPress.current = false;
    if (moveable.current && control.current) moveable.current.dragStart(e.nativeEvent, control.current);
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

  const guidesV = [0, (scene.width * scale) / 2, scene.width * scale];
  const guidesH = [0, (scene.height * scale) / 2, scene.height * scale];
  // Other layers as snap targets, by selector (resolved by Moveable, scoped to this editor's canvas).
  const otherLayers = scene.items
    .filter((i) => i.sourceId !== selected)
    .map((i) => `.sc-editor__canvas .sc-render [data-source-id="${CSS.escape(i.sourceId)}"]`);
  const lockRatio = ratioLock?.id === selected ? ratioLock.on : selectedSource?.kind === 'image' || selectedSource?.kind === 'vector';

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
            onMouseDown={onMouseDown}
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
                  transform: `translate(${hoveredItem.frame.x * scale}px, ${hoveredItem.frame.y * scale}px) rotate(${hoveredItem.frame.rotation ?? 0}deg)`,
                }}
              />
            )}
            {boxNow && (
              <div
                ref={control}
                className="sc-editor__target"
                data-testid="selection-box"
                style={{ width: boxNow.w, height: boxNow.h, transform: `translate(${boxNow.x}px, ${boxNow.y}px) rotate(${boxNow.rotation}deg)` }}
              />
            )}
            {boxNow && (
              <div className="sc-editor__size" data-testid="selection-size" style={{ left: boxNow.x + boxNow.w / 2, top: boxNow.y + boxNow.h + 8 }}>
                {Math.round(boxNow.w / scale)} × {Math.round(boxNow.h / scale)}
              </div>
            )}
            {boxNow && !readOnly && (
              <Moveable
                key={selected ?? ''}
                ref={moveable}
                target={control}
                draggable
                resizable
                rotatable
                keepRatio={lockRatio || shift}
                origin={false}
                throttleDrag={0}
                throttleResize={0}
                throttleRotate={shift ? 15 : 0}
                snappable
                snapThreshold={6}
                isDisplaySnapDigit
                snapDirections={SNAP_DIRECTIONS}
                elementSnapDirections={SNAP_DIRECTIONS}
                verticalGuidelines={guidesV}
                horizontalGuidelines={guidesH}
                elementGuidelines={otherLayers}
                onDragStart={(e) => e.set([boxNow.x, boxNow.y])}
                onDrag={(e) => moveTo({ ...(liveRef.current ?? boxNow), x: e.beforeTranslate[0] ?? 0, y: e.beforeTranslate[1] ?? 0 })}
                onDragEnd={commit}
                onResizeStart={(e) => {
                  e.setOrigin(['%', '%']);
                  if (e.dragStart) e.dragStart.set([boxNow.x, boxNow.y]);
                }}
                onResize={(e) =>
                  moveTo({
                    ...(liveRef.current ?? boxNow),
                    w: e.width,
                    h: e.height,
                    x: e.drag.beforeTranslate[0] ?? 0,
                    y: e.drag.beforeTranslate[1] ?? 0,
                  })
                }
                onResizeEnd={commit}
                onRotateStart={(e) => e.set(boxNow.rotation)}
                onRotate={(e) => moveTo({ ...(liveRef.current ?? boxNow), rotation: e.beforeRotate })}
                onRotateEnd={commit}
              />
            )}
          </div>
          {hand && <div className="sc-editor__pan" data-testid="pan-surface" {...panHandlers} />}
        </div>
        <DesignPanel
          scene={scene}
          source={selectedItem ? selectedSource : null}
          frame={live ? { x: live.x / scale, y: live.y / scale, w: live.w / scale, h: live.h / scale, rotation: live.rotation } : (selectedItem?.frame ?? null)}
          lockRatio={lockRatio}
          onLockRatio={(on) => selected && setRatioLock({ id: selected, on })}
          onCommit={(f) => selected && onCommit(selected, { x: f.x, y: f.y, w: f.w, h: f.h, ...(f.rotation ? { rotation: f.rotation } : {}) })}
          readOnly={readOnly}
        >
          {selectedSource && sidePanel?.(selectedSource)}
        </DesignPanel>
      </div>
    </div>
  );
}

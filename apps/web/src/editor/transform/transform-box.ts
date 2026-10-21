/**
 * TransformBox — the DOM side: a frame + 8 scale handles + a rotate handle around one target element,
 * driven by Pointer Events (one code path for mouse, pen and touch; `pointerType` picks the rules).
 *
 * Mouse / pen (as in Affinity Designer)
 *   corner handle            scale, opposite corner fixed (Shift = free ratio, Alt = about the centre)
 *   edge handle              drag outward = stretch; drag along the edge = skew, opposite edge fixed
 *                            (Alt = about the centre; Ctrl/⌘ = skew whatever the direction)
 *   rotate handle            rotate about the centre (Shift snaps 15°)
 *   drag the element         move
 *   double-click a handle    undo what that handle changed (see removeForHandle)
 *
 * Touch
 *   press and hold (LONG_PRESS_MS) on a handle or the element, then drag. A finger that moves before the
 *   hold completes is a scroll: the gesture is dropped and the page scrolls as usual.
 *   edge handles: the first DIRECTION_LOCK_PX of movement decide — along the handle's normal = stretch,
 *   along its edge = skew — and the choice holds until the finger lifts.
 *   double-tap a handle      reset, as above
 *
 * History: every gesture is recorded as one operation in a TransformDoc (see math.ts). The state is the
 * operations replayed; a double-click removes that handle's operations and replays the rest, so the element
 * lands exactly where it would be had those drags never happened, in any combination and order.
 *
 * The overlay is NOT transformed: handle positions are computed from the state each frame, so handles keep
 * their on-screen size and stay square while the element is scaled, skewed or rotated.
 */
import {
  applyOp, classifyEdgeDrag, corners, derive, docFromState, HANDLE_UV, handleFrame, isCorner, moveOp, pointAt,
  pushOp, resetForHandle, rotateHandlePos, rotateOp, SCALE_HANDLES, scaleOp, skewOp, sub, len, toCssMatrix,
  type EdgeIntent, type HandleId, type ScaleHandle, type TransformDoc, type TransformOp, type TransformState, type Vec,
} from './math';

export interface TransformBoxOptions {
  /** Hold time before a touch drag starts, ms. */
  longPressMs?: number;
  /** Max time between the two taps / clicks of a double, ms. */
  doubleTapMs?: number;
  /** Touch: movement allowed during the hold before it counts as a scroll, px. */
  touchSlopPx?: number;
  /** Touch: movement needed before an edge drag picks stretch vs skew, px. */
  directionLockPx?: number;
  /** Distance of the rotate handle beyond the top edge, px. */
  rotateGapPx?: number;
  /** Edge handles pick stretch vs skew by drag direction with a mouse too (Affinity). false = mouse edges
   *  only stretch, and Ctrl/⌘ skews. Touch always uses the direction rule. */
  directionalMouse?: boolean;
  /**
   * Called on every change. `phase` lets an app commit one undo step per gesture ('end' / 'reset'); store
   * `info.doc` (the history), not just the state, so resets still work after a reload / undo.
   */
  onChange?: (state: TransformState, info: ChangeInfo) => void;
  /** Touch hold completed (good moment for haptics / a sound). */
  onArm?: (handle: HandleId) => void;
  /**
   * Screen px per state unit. The state (and its history) is kept in the caller's units (the editor: design
   * px) so zooming and panning never touch it; the box draws and reads the pointer at this scale.
   */
  getScale?: () => number;
  /** Whether a corner drag keeps the proportions (given Shift). Default: unless Shift is held. */
  proportional?: (shift: boolean) => boolean;
  /** Dragging past the opposite edge mirrors the element (default true). */
  flip?: boolean;
  /**
   * Moves snap: given where a move would put the element, return the correction (state units) and the guide
   * lines to show (stage x / y in state units), or null for no snap.
   */
  snapMove?: (moved: TransformState) => { dx: number; dy: number; x: number[]; y: number[] } | null;
}

export interface ChangeInfo {
  /** The history after this change (on 'end' and 'reset'; during a drag, the history before it). */
  doc: TransformDoc;
  phase: 'start' | 'move' | 'end' | 'reset';
  handle: HandleId;
  mode?: Mode;
}
export type Mode = 'move' | 'scale' | 'stretch' | 'skew' | 'rotate';

/** One pointer's gesture. `pending` = touch waiting for the hold; `active` = transforming. */
interface Gesture {
  pointerId: number;
  pointerType: string;
  handle: HandleId;
  phase: 'pending' | 'active';
  /** Where the pointer went down (for slop / tap tests) and where the transform is measured from. */
  down: Vec;
  origin: Vec;
  last: Vec;
  start: TransformState;
  /** The operation this gesture makes (replaced on every move, appended to the history when it ends). */
  op: TransformOp | null;
  moved: boolean;
  /** Edge handles: chosen once per gesture. */
  intent: EdgeIntent | null;
  timer: number | undefined;
  /** The stage's box, measured once per gesture (see `measure`). */
  box: StageBox;
  /** Last pointer position in client px, to re-measure from when a touch arms. */
  client: Vec;
  /** Where it went down, client px: slops and taps are measured on screen, whatever the zoom. */
  downClient: Vec;
  mods: { shift: boolean; alt: boolean; ctrl: boolean };
}

/** What converting client px to stage px needs. */
interface StageBox { left: number; top: number; zoomX: number; zoomY: number; offX: number; offY: number }

const DEFAULTS = {
  longPressMs: 350, doubleTapMs: 300, touchSlopPx: 10, directionLockPx: 8, rotateGapPx: 28, directionalMouse: true,
  getScale: () => 1, proportional: (shift: boolean) => !shift, flip: true,
};
/** Two taps further apart than this are not a double tap. */
const DOUBLE_TAP_DIST = 24;
/** A mouse press that moves less than this is a click, not a drag. */
const CLICK_SLOP = 3;

const LABEL: Record<HandleId, string> = {
  nw: 'Top-left corner', n: 'Top edge', ne: 'Top-right corner', e: 'Right edge', se: 'Bottom-right corner',
  s: 'Bottom edge', sw: 'Bottom-left corner', w: 'Left edge', rotate: 'Rotate', body: 'Move',
};
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

export class TransformBox {
  private state: TransformState;
  private doc: TransformDoc;
  private readonly opts: Required<Omit<TransformBoxOptions, 'onChange' | 'onArm' | 'snapMove'>> & Pick<TransformBoxOptions, 'onChange' | 'onArm' | 'snapMove'>;
  private readonly guides: SVGGElement;
  private guideLines: { x: number[]; y: number[] } = { x: [], y: [] };
  private readonly overlay: HTMLDivElement;
  private readonly frame: SVGPolygonElement;
  private readonly stem: SVGLineElement;
  private readonly handles = new Map<HandleId, HTMLElement>();
  private gesture: Gesture | null = null;
  private lastTap: { handle: HandleId; time: number; at: Vec } | null = null;
  private frameRequest = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly stage: HTMLElement,
    private readonly target: HTMLElement,
    initial: TransformState | TransformDoc,
    options: TransformBoxOptions = {},
  ) {
    this.doc = 'ops' in initial ? initial : docFromState(initial);
    this.state = derive(this.doc);
    this.opts = { ...DEFAULTS, ...options };

    // The target is laid out at the stage's origin at its own size (set on each render); the matrix does the rest.
    Object.assign(target.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
    target.classList.add('tb-target');
    target.dataset.tbHandle = 'body';

    // Overlay: a frame (SVG polygon — it becomes a parallelogram when skewed) and the handles.
    this.overlay = document.createElement('div');
    this.overlay.className = 'tb-overlay';
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'tb-frame');
    this.frame = document.createElementNS(svgNs, 'polygon');
    this.stem = document.createElementNS(svgNs, 'line');
    this.guides = document.createElementNS(svgNs, 'g');
    this.guides.setAttribute('class', 'tb-guides');
    svg.append(this.guides, this.stem, this.frame);
    this.overlay.append(svg);
    for (const h of [...SCALE_HANDLES, 'rotate'] as HandleId[]) {
      const el = document.createElement('div');
      el.className = `tb-handle tb-handle--${h === 'rotate' ? 'rotate' : isCorner(h) ? 'corner' : 'edge'}`;
      el.dataset.tbHandle = h;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${LABEL[h]} — drag to ${h === 'rotate' ? 'rotate' : isCorner(h) ? 'scale' : 'stretch or skew'}, double-click to reset`);
      if (h === 'rotate') el.innerHTML = ROTATE_ICON;
      this.handles.set(h, el);
      this.overlay.append(el);
    }
    stage.append(this.overlay);

    this.listen(this.overlay, 'pointerdown', this.onDown as EventListener);
    this.listen(target, 'pointerdown', this.onDown as EventListener);
    this.listen(window, 'pointermove', this.onMove as EventListener);
    this.listen(window, 'pointerup', this.onUp as EventListener);
    this.listen(window, 'pointercancel', this.onCancel as EventListener);
    // Once a touch gesture is armed, stop the page from scrolling under the finger. This must be a
    // non-passive touchmove listener: `touch-action` is fixed when the touch starts (it allows panning so
    // a quick swipe still scrolls), so cancelling touchmove is the only way to block it afterwards.
    const blockScroll = (e: TouchEvent) => {
      if (this.gesture?.phase === 'active' && e.cancelable) e.preventDefault();
    };
    this.listen(document, 'touchmove', blockScroll as EventListener, { passive: false });
    // Long-press opens the context menu / text selection callout on mobile; not on our handles.
    const noMenu = (e: Event) => {
      if (this.gesture || (e.target as HTMLElement).closest?.('[data-tb-handle]')) e.preventDefault();
    };
    this.listen(this.overlay, 'contextmenu', noMenu);
    this.listen(target, 'contextmenu', noMenu);

    this.render();
  }

  // ------------------------------------------------------------ public API

  getState(): TransformState {
    return { ...this.state };
  }

  getDoc(): TransformDoc {
    return this.doc;
  }

  /** Replace the history (undo/redo, reload). Doesn't fire onChange. */
  setDoc(doc: TransformDoc): void {
    this.doc = doc;
    this.state = derive(doc);
    this.scheduleRender();
  }

  /** Replace the state without a history (resets then undo it as shear → scale → rotate about the centre). */
  setState(next: TransformState): void {
    this.doc = docFromState(next);
    this.state = derive(this.doc);
    this.scheduleRender();
  }

  /** Reset what a handle edits — the same as double-clicking it. */
  reset(handle: HandleId): void {
    this.doc = resetForHandle(this.doc, handle);
    this.state = derive(this.doc);
    this.scheduleRender();
    this.opts.onChange?.(this.getState(), { phase: 'reset', handle, doc: this.doc });
  }

  /** A gesture is running (or a touch is holding): outside changes wait until it ends. */
  isBusy(): boolean {
    return this.gesture !== null;
  }

  /** Redraw now (the caller's scale changed: zoom). */
  refresh(): void {
    this.render();
  }

  destroy(): void {
    this.cancelGesture();
    cancelAnimationFrame(this.frameRequest);
    for (const off of this.cleanup) off();
    this.overlay.remove();
    this.target.classList.remove('tb-target');
  }

  // ------------------------------------------------------------ pointer → stage coordinates

  /**
   * Measure the stage once per gesture: correct when the stage scrolls, has a border, or is itself CSS-scaled
   * (zoom). Measuring per move would also be slower, and wrong whenever the page reflows mid-gesture (a status
   * line wrapping, a toolbar appearing): the finger hasn't moved, but the deltas would jump.
   */
  private measure(): StageBox {
    const st = this.stage;
    const r = st.getBoundingClientRect();
    return {
      left: r.left, top: r.top,
      zoomX: r.width / (st.offsetWidth || r.width || 1), zoomY: r.height / (st.offsetHeight || r.height || 1),
      offX: st.scrollLeft - st.clientLeft, offY: st.scrollTop - st.clientTop,
    };
  }

  /** Client px → state units (stage px over the caller's scale). */
  private toStage(c: Vec, b: StageBox): Vec {
    const k = this.opts.getScale();
    return { x: ((c.x - b.left) / b.zoomX + b.offX) / k, y: ((c.y - b.top) / b.zoomY + b.offY) / k };
  }

  // ------------------------------------------------------------ events

  private onDown = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tb-handle]');
    if (el) this.startGesture(e, el.dataset.tbHandle as HandleId, el);
  };

  /**
   * Start a gesture from a press that began elsewhere — the editor selects a layer on pointerdown and the
   * same press goes on as a move of it (mouse: at once; touch: after the hold, like any press).
   */
  beginDrag(e: PointerEvent, handle: HandleId = 'body'): void {
    this.startGesture(e, handle, handle === 'body' ? this.target : (this.handles.get(handle) ?? this.target));
  }

  private startGesture(e: PointerEvent, handle: HandleId, el: HTMLElement) {
    if (this.gesture) return; // one pointer at a time; a second finger is left to the browser (pinch)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const client = { x: e.clientX, y: e.clientY };
    const box = this.measure();
    const at = this.toStage(client, box);
    const touch = e.pointerType === 'touch';
    this.gesture = {
      pointerId: e.pointerId, pointerType: e.pointerType, handle, phase: touch ? 'pending' : 'active',
      down: at, origin: at, last: at, start: this.getState(), op: null, moved: false, intent: null, timer: undefined, box, client, downClient: client,
      mods: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey },
    };
    if (touch) {
      // No preventDefault: if the finger moves before the hold completes, the browser scrolls (and we drop it).
      this.gesture.timer = window.setTimeout(() => this.arm(), this.opts.longPressMs);
    } else {
      e.preventDefault(); // no text selection / native image drag
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // The press may already have ended (a synthetic or replayed event); window listeners still follow it.
      }
    }
  }

  /** Touch hold completed: from here on the finger transforms instead of scrolling. */
  private arm() {
    const g = this.gesture;
    if (!g || g.phase !== 'pending') return;
    g.phase = 'active';
    g.timer = undefined;
    // Re-measure (the page may have scrolled or reflowed during the hold) and start from where the finger
    // is now — it may have crept within the slop — so nothing jumps.
    g.box = this.measure();
    g.origin = g.last = g.down = this.toStage(g.client, g.box);
    g.downClient = g.client;
    g.start = this.getState();
    this.handles.get(g.handle)?.setPointerCapture?.(g.pointerId);
    this.overlay.classList.add('tb-armed');
    this.overlay.dataset.armed = g.handle;
    navigator.vibrate?.(12);
    this.opts.onArm?.(g.handle);
  }

  private onMove = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    g.client = { x: e.clientX, y: e.clientY };
    const at = this.toStage(g.client, g.box);
    g.last = at;
    g.mods = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey };

    if (g.phase === 'pending') {
      // Moved before the hold completed: it's a scroll or a swipe, not a transform.
      if (len(sub(g.client, g.downClient)) > this.opts.touchSlopPx) this.cancelGesture();
      return;
    }
    if (!g.moved) {
      if (g.pointerType !== 'touch' && len(sub(g.client, g.downClient)) < CLICK_SLOP) return;
      g.moved = true;
      this.opts.onChange?.(this.getState(), { phase: 'start', handle: g.handle, mode: this.modeOf(g) ?? undefined, doc: this.doc });
    }
    const op = this.compute(g, at);
    if (!op) return; // edge drag still deciding stretch vs skew
    g.op = op;
    this.state = applyOp(g.start, op);
    this.scheduleRender();
    this.opts.onChange?.(this.getState(), { phase: 'move', handle: g.handle, mode: this.modeOf(g) ?? undefined, doc: this.doc });
  };

  private onUp = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const wasTap = (g.phase === 'pending' || !g.moved) && len(sub({ x: e.clientX, y: e.clientY }, g.downClient)) <= this.opts.touchSlopPx;
    // A touch that was held (armed) and let go without moving is neither a drag nor a tap.
    const armedHold = g.pointerType === 'touch' && g.phase === 'active' && !g.moved;
    if (g.moved) {
      if (g.op) this.doc = pushOp(this.doc, g.op);
      // The state is the replayed history from here on (identical to what the drag showed).
      this.state = derive(this.doc);
      this.scheduleRender();
      this.opts.onChange?.(this.getState(), { phase: 'end', handle: g.handle, mode: this.modeOf(g) ?? undefined, doc: this.doc });
    }
    this.cancelGesture();
    if (wasTap && !armedHold) this.tap(g.handle, g.downClient);
  };

  private onCancel = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    // The browser took the touch (scroll/zoom) or the window lost the pointer: put back the start state.
    if (g.moved) {
      this.state = g.start;
      this.scheduleRender();
      this.opts.onChange?.(this.getState(), { phase: 'end', handle: g.handle, doc: this.doc });
    }
    this.cancelGesture();
  };

  /** Double-click / double-tap: two taps on the same handle within doubleTapMs and DOUBLE_TAP_DIST. */
  /** `at` in client px. */
  private tap(handle: HandleId, at: Vec) {
    const now = performance.now();
    const prev = this.lastTap;
    if (prev && prev.handle === handle && now - prev.time <= this.opts.doubleTapMs && len(sub(at, prev.at)) <= DOUBLE_TAP_DIST) {
      this.lastTap = null;
      this.reset(handle);
      return;
    }
    this.lastTap = { handle, time: now, at };
  }

  private cancelGesture() {
    const g = this.gesture;
    if (!g) return;
    if (g.timer !== undefined) clearTimeout(g.timer);
    this.gesture = null;
    this.overlay.classList.remove('tb-armed');
    delete this.overlay.dataset.armed;
    delete this.overlay.dataset.intent;
    this.setGuides({ x: [], y: [] });
  }

  private setGuides(lines: { x: number[]; y: number[] }) {
    if (!lines.x.length && !lines.y.length && !this.guideLines.x.length && !this.guideLines.y.length) return;
    this.guideLines = lines;
    this.scheduleRender();
  }

  // ------------------------------------------------------------ gesture → new state

  /** What the gesture does (null = an edge drag on touch that hasn't picked stretch vs skew yet). */
  private modeOf(g: Gesture): Mode | null {
    if (g.handle === 'body') return 'move';
    if (g.handle === 'rotate') return 'rotate';
    if (isCorner(g.handle)) return 'scale';
    if (g.pointerType !== 'touch' && g.mods.ctrl) return 'skew';
    const directional = g.pointerType === 'touch' || this.opts.directionalMouse;
    if (!directional) return 'stretch';
    return g.intent;
  }

  /** The operation for the pointer at `at` (null = an edge drag still deciding stretch vs skew). */
  private compute(g: Gesture, at: Vec): TransformOp | null {
    const { start, origin, handle, mods } = g;
    if (handle === 'body') {
      // Snap the moved box to the caller's guides; the correction rides on the move itself.
      const op = moveOp(origin, at);
      const snap = this.opts.snapMove?.(applyOp(start, op)) ?? null;
      this.setGuides(snap ?? { x: [], y: [] });
      return snap ? moveOp(origin, { x: at.x + snap.dx, y: at.y + snap.dy }) : op;
    }
    if (handle === 'rotate') return rotateOp(start, origin, at, mods.shift ? 15 : 0);
    const scaleOpts = { pivot: mods.alt ? ('center' as const) : ('opposite' as const), free: !this.opts.proportional(mods.shift), flip: this.opts.flip };
    if (isCorner(handle)) return scaleOp(start, handle, origin, at, scaleOpts);

    const edge = handle as 'n' | 'e' | 's' | 'w';
    const forced = g.pointerType !== 'touch' && mods.ctrl;
    const directional = !forced && (g.pointerType === 'touch' || this.opts.directionalMouse);
    if (directional && !g.intent) {
      // Decide once, from the start state's geometry (the handle's normal and edge before this drag).
      g.intent = classifyEdgeDrag(start, edge, sub(at, origin), this.opts.directionLockPx / this.opts.getScale());
      if (!g.intent) return null;
      this.overlay.dataset.intent = g.intent;
    }
    const skew = forced || (directional && g.intent === 'skew');
    return skew ? skewOp(start, edge, origin, at, scaleOpts.pivot) : scaleOp(start, edge, origin, at, scaleOpts);
  }

  // ------------------------------------------------------------ rendering

  private scheduleRender() {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this.render();
    });
  }

  private render() {
    // Everything on screen is the state at the caller's scale (stage px).
    const k = this.opts.getScale();
    const u = this.state;
    const s: TransformState = { ...u, x: u.x * k, y: u.y * k, width: u.width * k, height: u.height * k };
    this.target.style.width = `${s.width}px`;
    this.target.style.height = `${s.height}px`;
    this.target.style.transform = toCssMatrix(s);
    this.guides.replaceChildren(
      ...this.guideLines.x.map((x) => guideLine(x * k, -1e4, x * k, 1e4)),
      ...this.guideLines.y.map((y) => guideLine(-1e4, y * k, 1e4, y * k)),
    );

    const pts = corners(s);
    this.frame.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
    const top = pointAt(s, HANDLE_UV.n);
    const rot = rotateHandlePos(s, this.opts.rotateGapPx);
    this.stem.setAttribute('x1', `${top.x}`);
    this.stem.setAttribute('y1', `${top.y}`);
    this.stem.setAttribute('x2', `${rot.x}`);
    this.stem.setAttribute('y2', `${rot.y}`);

    // Handles: centred on their point, turned with the element's top edge so squares follow the rotation.
    const topEdge = handleFrame(s, 'n').tangent;
    const angle = Math.atan2(topEdge.y, topEdge.x) * (180 / Math.PI);
    for (const [h, el] of this.handles) {
      const p = h === 'rotate' ? rot : pointAt(s, HANDLE_UV[h as ScaleHandle]);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${angle}deg)`;
      if (h !== 'rotate') {
        // Resize cursor along the handle's normal, in 45° steps.
        const n = handleFrame(s, h as ScaleHandle).normal;
        const octant = Math.round((Math.atan2(n.y, n.x) * 4) / Math.PI);
        el.style.cursor = RESIZE_CURSORS[((octant % 4) + 4) % 4] as string;
      }
    }
    // Edge handles get too close together on a small box; hide them (corners still scale) below ~3 handles' room.
    const w = len(sub(pts[1] as Vec, pts[0] as Vec));
    const hgt = len(sub(pts[3] as Vec, pts[0] as Vec));
    this.overlay.classList.toggle('tb-small-x', w < 48);
    this.overlay.classList.toggle('tb-small-y', hgt < 48);
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.cleanup.push(() => t.removeEventListener(type, fn, opts));
  }
}

function guideLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', `${x1}`);
  l.setAttribute('y1', `${y1}`);
  l.setAttribute('x2', `${x2}`);
  l.setAttribute('y2', `${y2}`);
  return l;
}

const ROTATE_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

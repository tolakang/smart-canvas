/**
 * Design panel (T10.1): the editor's right panel, Figma style. With nothing selected it shows the canvas and
 * the shortcuts; with a layer selected, its position, size, rotation and skew in design px (typed values go through
 * the editor's commit, so the main preview writes placements and an output writes an override), then the
 * caller's panels for that layer (text style, overrides).
 */
import { MAX_SHEAR_DEG, type Frame, type InputSource, type RenderScene } from '@smart-canvas/core';
import type { ReactNode } from 'react';
import { NumberField } from '../ui/NumberField';

const KIND_LABEL = { image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' } as const;
/** Shown values: whole design px (as the selection badge), rotation to 0.1°. Typed values are kept as typed. */
const round = (n: number) => Math.round(n);
const roundDeg = (n: number) => Math.round(n * 10) / 10;

export const SHORTCUTS: [string, string][] = [
  ['V', 'Move tool'],
  ['H or hold Space', 'Hand tool (pan)'],
  ['Wheel / Shift+wheel', 'Pan'],
  ['Ctrl/⌘ + wheel', 'Zoom at the pointer'],
  ['Ctrl/⌘ + = / −', 'Zoom in / out'],
  ['Shift+1', 'Zoom to fit'],
  ['Shift+0', 'Zoom to 100%'],
  ['Shift + drag a handle', 'Keep proportions · rotate in 15° steps'],
  ['Drag an edge along itself', 'Skew (the opposite edge stays)'],
  ['Ctrl/⌘ + drag an edge', 'Skew, whichever way you drag'],
  ['Alt + drag a handle', 'Resize or skew about the centre'],
  ['Double-click a handle', 'Undo what that handle changed'],
  ['Alt+click', 'Select the layer behind'],
  ['Arrows (Shift)', 'Nudge 1 px (10 px)'],
  ['Esc', 'Deselect, then close'],
];

export function DesignPanel(props: {
  scene: RenderScene;
  source: InputSource | null;
  frame: Frame | null;
  lockRatio: boolean;
  onLockRatio: (on: boolean) => void;
  onCommit: (frame: Frame) => void;
  readOnly: boolean;
  children?: ReactNode;
}) {
  const { source, frame, readOnly } = props;
  if (!source || !frame) {
    return (
      <aside className="sc-design" aria-label="Design">
        <section className="sc-design__section">
          <div className="sc-design__title">Canvas</div>
          <div className="sc-design__value">
            {round(props.scene.width)} × {round(props.scene.height)} <span className="sc-muted">design px</span>
          </div>
        </section>
        {/* Touch screens get gestures instead of keyboard shortcuts. */}
        <section className="sc-design__section sc-design__touch">
          <div className="sc-design__title">Gestures</div>
          <p className="sc-design__hint">
            Tap a layer to select it · hold, then drag to move · hold a handle, then drag: outward to resize, along the edge to skew · double-tap a handle to
            undo what it changed · pinch to zoom · two fingers to pan
          </p>
        </section>
        <section className="sc-design__section sc-design__shortcuts">
          <div className="sc-design__title">Shortcuts</div>
          <dl className="sc-design__keys">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    );
  }

  const set = (patch: Partial<Frame>) => props.onCommit({ ...frame, ...patch });
  const setSize = (key: 'w' | 'h', n: number | null) => {
    if (n === null || n <= 0) return;
    if (!props.lockRatio) return set({ [key]: n });
    const k = key === 'w' ? n / frame.w : n / frame.h;
    set({ w: frame.w * k, h: frame.h * k });
  };
  const field = (label: string, name: string, value: number, onCommit: (n: number | null) => void, min = -100000, show = round) => (
    <NumberField
      className="sc-design__num"
      label={label}
      value={show(value)}
      min={min}
      max={100000}
      step={1}
      disabled={readOnly}
      onCommit={onCommit}
      ariaLabel={name}
    />
  );

  return (
    <aside className="sc-design" aria-label="Design">
      <section className="sc-design__section">
        <div className="sc-design__title">
          {source.label} <span className="sc-muted">{KIND_LABEL[source.kind]} · {source.behavesLike}</span>
        </div>
        <div className="sc-design__grid">
          {field('X', 'X', frame.x, (n) => n !== null && set({ x: n }))}
          {field('Y', 'Y', frame.y, (n) => n !== null && set({ y: n }))}
          {field('W', 'Width', frame.w, (n) => setSize('w', n), 1)}
          {field('H', 'Height', frame.h, (n) => setSize('h', n), 1)}
          {field('↻', 'Rotation', frame.rotation ?? 0, (n) => set({ rotation: ((((n ?? 0) % 360) + 540) % 360) - 180 }), -360, roundDeg)}
          {field('⫽', 'Skew', frame.shear ?? 0, (n) => set({ shear: Math.max(-MAX_SHEAR_DEG, Math.min(MAX_SHEAR_DEG, n ?? 0)) }), -MAX_SHEAR_DEG, roundDeg)}
          <button
            type="button"
            className="sc-design__lock"
            aria-label="Constrain proportions"
            aria-pressed={props.lockRatio}
            title="Constrain proportions"
            disabled={readOnly}
            onClick={() => props.onLockRatio(!props.lockRatio)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
            </svg>
          </button>
        </div>
      </section>
      {props.children}
    </aside>
  );
}

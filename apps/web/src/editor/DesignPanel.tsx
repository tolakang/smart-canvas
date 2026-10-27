/**
 * Design panel (T10.1): the editor's right panel, Figma style. With nothing selected it shows the canvas and
 * the shortcuts; with a layer selected, its position, size, rotation and skew in design px (typed values go through
 * the editor's commit, so the master preview writes placements and an output writes an override), then the
 * caller's panels for that layer (text style, overrides).
 */
import { MAX_SHEAR_DEG, type Frame, type InputSource, type RenderScene } from '@smart-canvas/core';
import type { ReactNode } from 'react';
import { NumberField } from '../ui/NumberField';
import { DESIGN, GESTURES_LIST, GRID, KEYS, LOCK, NUM, SECTION, SECTION_KEYS, SECTION_TOUCH, SUMMARY, TITLE } from './panels';

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
  ['Reset buttons on the box', 'Clear rotation / all transform'],
  ['Alt+click', 'Select the layer behind'],
  ['Arrows (Shift)', 'Nudge 1 px (10 px)'],
  ['Esc', 'Deselect, then close'],
];

/** Touch screens: what each gesture does, short. */
const GESTURES: [string, string][] = [
  ['Tap', 'Select a layer (again: the one behind)'],
  ['Drag', 'Move the selected layer'],
  ['Drag a handle', 'Resize · along an edge: skew'],
  ['Double-tap a handle', 'Undo what it changed'],
  ['One finger on empty', 'Move the canvas'],
  ['Pinch', 'Zoom'],
  ['Double-tap empty', 'Fit to screen'],
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
      <aside className={DESIGN} aria-label="Design">
        <section className={SECTION}>
          <div className={TITLE}>Canvas</div>
          <div className="sc-design__value">
            {round(props.scene.width)} × {round(props.scene.height)} <span className="sc-muted">design px</span>
          </div>
        </section>
        {/* Touch screens get gestures instead of keyboard shortcuts. */}
        <details className={SECTION_TOUCH}>
          <summary className={SUMMARY}>Gestures</summary>
          {/* V3 (owner: "The instructions is crowd, make it easy and clean for human to read"): one gesture per line. */}
          <dl className={GESTURES_LIST}>
            {GESTURES.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
        {/* U4: the keys are there when wanted, folded away otherwise. */}
        <details className={SECTION_KEYS}>
          <summary className={SUMMARY}>Keyboard shortcuts</summary>
          <dl className={KEYS}>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
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
      className={NUM}
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
    <aside className={DESIGN} aria-label="Design">
      <section className={SECTION}>
        <div className={TITLE}>
          {source.label} <span className="sc-muted">{KIND_LABEL[source.kind]} · {source.behavesLike}</span>
        </div>
        <div className={GRID}>
          {field('X', 'X', frame.x, (n) => n !== null && set({ x: n }))}
          {field('Y', 'Y', frame.y, (n) => n !== null && set({ y: n }))}
          {field('W', 'Width', frame.w, (n) => setSize('w', n), 1)}
          {field('H', 'Height', frame.h, (n) => setSize('h', n), 1)}
          {field('↻', 'Rotation', frame.rotation ?? 0, (n) => set({ rotation: ((((n ?? 0) % 360) + 540) % 360) - 180 }), -360, roundDeg)}
          {field('⫽', 'Skew', frame.shear ?? 0, (n) => set({ shear: Math.max(-MAX_SHEAR_DEG, Math.min(MAX_SHEAR_DEG, n ?? 0)) }), -MAX_SHEAR_DEG, roundDeg)}
          <button
            type="button"
            className={LOCK}
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

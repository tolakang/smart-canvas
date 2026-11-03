/**
 * D82 / D83: a strip of sizes along the bottom of an editor's stage, each a live Preview with its size. The layout
 * editor lists the sizes that follow the open layout ("Used by"); Edit all lists every size of a Preset node, the one
 * being edited lit. A click picks one. D85: the layout editor's strip also holds the master's three layouts (`StageStrip`
 * with the groups side by side).
 */
import { computeLayout, layerSources, outputScene } from '@smart-canvas/core';
import { useMemo, type ReactNode } from 'react';
import { assetUrl } from '../api';
import { useBoard } from '../board/context';
import { nameWithoutSize } from '../board/OutputNode';
import { RenderThumbnail } from '../render/OutputRenderer';

const STRIP =
  'sc-size-strip absolute right-12 bottom-12 left-12 z-3 flex items-end gap-12 overflow-x-auto rounded-[14px] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-12 py-8 [backdrop-filter:blur(10px)] [box-shadow:var(--shadow-2)]';
const TILE =
  'sc-size-tile grid flex-none cursor-pointer justify-items-start gap-3 rounded-[8px] p-3 text-[11px] text-muted [background:none] [border:0] hover:text-fg focus-visible:[outline:2px_solid_var(--accent)] aria-current:bg-accent-soft aria-current:text-accent aria-current:font-[650]';

/** The glass strip along the stage's bottom, holding one group or several side by side. */
export function StageStrip({ children }: { children: ReactNode }) {
  return <div className={STRIP}>{children}</div>;
}

/** A group in the strip: its heading, then its tiles. */
export const STRIP_GROUP = 'flex flex-none items-end gap-12';
export const STRIP_HEADING = 'self-center text-[11.5px] font-[650] whitespace-nowrap text-muted';
export const STRIP_TILE = TILE;

export function SizeStrip(props: {
  label: string;
  heading: string;
  outputIds: readonly string[];
  current?: string;
  onPick: (id: string) => void;
  pickName?: (label: string) => string;
  /** Inside a `StageStrip` with other groups: no glass of its own. */
  bare?: boolean;
}) {
  return (
    <div className={props.bare ? STRIP_GROUP : STRIP} role="group" aria-label={props.label}>
      <span className={STRIP_HEADING}>{props.heading}</span>
      {props.outputIds.map((id) => (
        <SizeTile key={id} outputId={id} current={id === props.current} onPick={() => props.onPick(id)} pickName={props.pickName} />
      ))}
    </div>
  );
}

function SizeTile({ outputId, current, onPick, pickName }: { outputId: string; current: boolean; onPick: () => void; pickName?: (label: string) => string }) {
  const { doc, layoutDeps, teamId } = useBoard();
  const o = doc.outputs.find((x) => x.id === outputId);
  const scene = useMemo(() => (o && layoutDeps ? outputScene(computeLayout(doc, o.id, layoutDeps), o) : null), [doc, o, layoutDeps]);
  const sources = useMemo(() => layerSources(doc), [doc]);
  if (!o || !scene) return null;
  const name = nameWithoutSize(o.label);
  return (
    <button type="button" className={TILE} onClick={onPick} aria-current={current || undefined} aria-label={pickName ? pickName(o.label) : o.label} title={o.label}>
      <RenderThumbnail scene={scene} sources={sources} assetSizes={layoutDeps?.assets} assetUrl={(id) => assetUrl(teamId, id)} maxWidth={96} maxHeight={40} />
      <span className="[font-variant-numeric:tabular-nums]">
        {name ? `${name} · ` : ''}
        {o.size.width} × {o.size.height}
      </span>
    </button>
  );
}

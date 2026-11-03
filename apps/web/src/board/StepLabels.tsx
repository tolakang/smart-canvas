/**
 * UX C2, option A (owner, 2026-11-03: "Go C2 option A"): the board names its three steps. A small label at the left of
 * each row of panels — Assets (the asset nodes), Main Comps, Sizes (the Preset nodes, their Previews beside them) —
 * on the canvas, at the same screen size at any zoom (`--zoom-inv`, as the name tags), never taking a click. The
 * labels are drawn from where the panels are each render, never stored; a row with no panel has no label.
 */
import { useStore, ViewportPortal, type Node } from '@xyflow/react';
import { compositionIdOfNode, isGroupNode, pairIdOfNode, setIdOfNode, sourceIdOfNode, stackIdOfNode } from './flow';

export type Step = 'assets' | 'main' | 'sizes';
export const STEP_LABEL: Record<Step, string> = { assets: 'Assets', main: 'Main Comps', sizes: 'Sizes' };

/** The step a panel belongs to; none for Previews (they sit beside their Preset node) and group frames. */
export function stepOf(nodeId: string): Step | null {
  if (isGroupNode(nodeId)) return null;
  if (sourceIdOfNode(nodeId) || stackIdOfNode(nodeId) || pairIdOfNode(nodeId)) return 'assets';
  if (compositionIdOfNode(nodeId)) return 'main';
  if (setIdOfNode(nodeId)) return 'sizes';
  return null;
}

/** A label's height on screen (px); two closer than this on screen, the lower one is left out. */
const LABEL_H = 22;

/**
 * Where each step's label goes (board px): at the top of its row's highest panel, ending at the left edge of the
 * whole board (every panel, Previews included) so the three line up in one column. In board order, top first; a label
 * that would touch the one above it on screen at `zoom` is left out. Pure.
 */
export function stepLabels(nodes: readonly Pick<Node, 'id' | 'position' | 'hidden'>[], zoom: number): { step: Step; x: number; y: number }[] {
  const shown = nodes.filter((n) => !n.hidden && !isGroupNode(n.id));
  if (!shown.length) return [];
  const left = Math.min(...shown.map((n) => n.position.x));
  const tops = new Map<Step, number>();
  for (const n of shown) {
    const step = stepOf(n.id);
    if (step) tops.set(step, Math.min(tops.get(step) ?? Infinity, n.position.y));
  }
  const rows = [...tops].map(([step, y]) => ({ step, x: left, y })).sort((a, b) => a.y - b.y);
  const kept: typeof rows = [];
  for (const r of rows) {
    const above = kept[kept.length - 1];
    if (above && (r.y - above.y) * zoom < LABEL_H) continue;
    kept.push(r);
  }
  return kept;
}

/** A step's name: quiet (it names a row, it isn't a panel), right-aligned 16 screen px left of the board. */
const LABEL =
  'sc-step__label absolute top-0 right-0 mr-16 origin-top-right text-[13px] leading-[22px] font-[650] tracking-[0.01em] whitespace-nowrap text-muted [transform:scale(var(--zoom-inv,1))]';

/**
 * Whether a label fits on screen to the left of the board: its left end (16 px gap, about 7.5 px a character) at
 * least 4 px inside the canvas. A phone opens on the first panels at the screen's edge (D70); a label cut off there
 * would read as a stray letter, so it shows only once the board is moved right enough. `tx`: the viewport's x.
 */
export function labelFits(step: Step, boardX: number, zoom: number, tx: number): boolean {
  return boardX * zoom + tx - 16 - STEP_LABEL[step].length * 7.5 >= 4;
}

export function StepLabels({ nodes }: { nodes: readonly Node[] }) {
  const [tx, , zoom] = useStore((st) => st.transform);
  const labels = stepLabels(nodes, zoom || 1).filter((l) => labelFits(l.step, l.x, zoom || 1, tx));
  return (
    <ViewportPortal>
      <div className="sc-steps pointer-events-none absolute top-0 left-0" aria-hidden="true">
        {labels.map((l) => (
          <div key={l.step} className={`sc-step sc-step--${l.step} pointer-events-none absolute top-0 left-0 h-0 w-0`} style={{ transform: `translate(${l.x}px, ${l.y}px)` }}>
            <span className={LABEL}>{STEP_LABEL[l.step]}</span>
          </div>
        ))}
      </div>
    </ViewportPortal>
  );
}

/**
 * U3 (D64): zoomed out, panel text is too small to read, so each panel gets a name tag above it, like a design tool's
 * frame names: the panel's name, and for a Preview its approval and open comments. The tags keep their screen size
 * at any zoom (`--zoom` on the board) and never take a click — every control underneath still works.
 */
import { assetStacks, compositionById, languagePairs, presetSets, type ProjectDoc } from '@smart-canvas/core';
import { ViewportPortal, type Node } from '@xyflow/react';
import { compositionIdOfNode } from './flow';
import { nameWithoutSize } from './OutputNode';
import { approvalOf, type ApprovalState } from './review';

/** Below this zoom the tags show. */
export const LABEL_ZOOM = 0.6;

/** A name tag: dark, above the panel's top-left corner, the same screen size at any zoom (--zoom-inv). */
const TAG =
  'sc-zlabel__tag absolute bottom-0 left-0 mb-6 inline-flex max-w-[320px] origin-bottom-left items-center gap-6 rounded-[8px] bg-fg px-9 py-4 text-[12px] font-[600] whitespace-nowrap text-bg [transform:scale(var(--zoom-inv,1))] [box-shadow:var(--shadow-2)]';
/** A mark after the name: approved, changed since, or open comments. */
const MARK = 'sc-zlabel__mark rounded-[6px] px-6 py-0 text-[11px]';

/** The name a panel goes by on the board, or null for nodes without one (group frames have their own). */
export function panelTitle(doc: ProjectDoc, nodeId: string): string | null {
  const [kind, ...rest] = nodeId.split(':');
  const id = rest.join(':');
  if (kind === 'src') return doc.sources.find((s) => s.id === id)?.label ?? null;
  if (kind === 'stk') return assetStacks(doc).find((s) => s.id === id)?.label ?? null;
  if (kind === 'hl') return languagePairs(doc).find((p) => p.id === id)?.label ?? null;
  if (kind === 'out') {
    const o = doc.outputs.find((x) => x.id === id);
    if (!o) return null;
    // Once: "GDN 1200×200", not "GDN 1200×200 · 1200 × 200 px" (owner: "redundant").
    const size = `${o.size.width}×${o.size.height}${o.size.unit === 'px' ? '' : ` ${o.size.unit}`}`;
    const name = nameWithoutSize(o.label);
    return name ? `${name} ${size}` : size;
  }
  if (kind === 'set') {
    const s = presetSets(doc).find((x) => x.id === id);
    return s ? `${s.label} · ${s.outputs.length} ${s.outputs.length === 1 ? 'size' : 'sizes'}` : null;
  }
  const comp = compositionIdOfNode(nodeId);
  return comp && compositionById(doc, comp) ? 'Main Comps' : null;
}

export function ZoomLabels(props: {
  nodes: readonly Node[];
  doc: ProjectDoc;
  approvals: ReadonlyMap<string, ApprovalState>;
  openComments: ReadonlyMap<string, number>;
}) {
  return (
    <ViewportPortal>
      <div className="sc-zlabels pointer-events-none absolute top-0 left-0" aria-hidden="true">
        {props.nodes.map((n) => {
          if (n.hidden || n.id.startsWith('grp:')) return null;
          const title = panelTitle(props.doc, n.id);
          if (!title) return null;
          const outputId = n.id.startsWith('out:') ? n.id.slice(4) : null;
          const state = outputId ? approvalOf(props.approvals, outputId).state : 'none';
          const open = outputId ? (props.openComments.get(outputId) ?? 0) : 0;
          return (
            <div key={n.id} className="sc-zlabel pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${n.position.x}px, ${n.position.y}px)`, width: n.measured?.width ?? n.width }}>
              <span className={TAG}>
                <span className="sc-zlabel__name overflow-hidden text-ellipsis">{title}</span>
                {state === 'approved' && <span className={`sc-zlabel__mark--ok ${MARK} bg-ok text-on-accent`}>✓</span>}
                {state === 'changed' && <span className={`sc-zlabel__mark--warn ${MARK} bg-warn text-on-accent`}>changed</span>}
                {open > 0 && (
                  <span className={`${MARK} bg-[color-mix(in_srgb,var(--bg)_18%,transparent)]`}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
                    </svg>{' '}
                    {open}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </ViewportPortal>
  );
}

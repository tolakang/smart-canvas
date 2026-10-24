/**
 * U3 (D64): zoomed out, panel text is too small to read, so each panel gets a name tag above it, like a design tool's
 * frame names: the panel's name, and for a Preview its approval and open comments. The tags keep their screen size
 * at any zoom (`--zoom` on the board) and never take a click — every control underneath still works.
 */
import { assetStacks, compositionById, languagePairs, presetSets, type ProjectDoc } from '@smart-canvas/core';
import { ViewportPortal, type Node } from '@xyflow/react';
import { compositionIdOfNode } from './flow';
import { approvalOf, type ApprovalState } from './review';

/** Below this zoom the tags show. */
export const LABEL_ZOOM = 0.6;

/** The name a panel goes by on the board, or null for nodes without one (group frames have their own). */
export function panelTitle(doc: ProjectDoc, nodeId: string): string | null {
  const [kind, ...rest] = nodeId.split(':');
  const id = rest.join(':');
  if (kind === 'src') return doc.sources.find((s) => s.id === id)?.label ?? null;
  if (kind === 'stk') return assetStacks(doc).find((s) => s.id === id)?.label ?? null;
  if (kind === 'hl') return languagePairs(doc).find((p) => p.id === id)?.label ?? null;
  if (kind === 'out') {
    const o = doc.outputs.find((x) => x.id === id);
    return o ? `${o.label} · ${o.size.width} × ${o.size.height} ${o.size.unit}` : null;
  }
  if (kind === 'set') {
    const s = presetSets(doc).find((x) => x.id === id);
    return s ? `${s.label} · ${s.outputs.length} ${s.outputs.length === 1 ? 'size' : 'sizes'}` : null;
  }
  const comp = compositionIdOfNode(nodeId);
  return comp && compositionById(doc, comp) ? 'Layer Comp' : null;
}

export function ZoomLabels(props: {
  nodes: readonly Node[];
  doc: ProjectDoc;
  approvals: ReadonlyMap<string, ApprovalState>;
  openComments: ReadonlyMap<string, number>;
}) {
  return (
    <ViewportPortal>
      <div className="sc-zlabels" aria-hidden="true">
        {props.nodes.map((n) => {
          if (n.hidden || n.id.startsWith('grp:')) return null;
          const title = panelTitle(props.doc, n.id);
          if (!title) return null;
          const outputId = n.id.startsWith('out:') ? n.id.slice(4) : null;
          const state = outputId ? approvalOf(props.approvals, outputId).state : 'none';
          const open = outputId ? (props.openComments.get(outputId) ?? 0) : 0;
          return (
            <div key={n.id} className="sc-zlabel" style={{ transform: `translate(${n.position.x}px, ${n.position.y}px)`, width: n.measured?.width ?? n.width }}>
              <span className="sc-zlabel__tag">
                <span className="sc-zlabel__name">{title}</span>
                {state === 'approved' && <span className="sc-zlabel__mark sc-zlabel__mark--ok">✓</span>}
                {state === 'changed' && <span className="sc-zlabel__mark sc-zlabel__mark--warn">changed</span>}
                {open > 0 && (
                  <span className="sc-zlabel__mark">
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

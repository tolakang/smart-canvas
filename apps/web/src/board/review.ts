/**
 * D63 review of Previews, on the client: the project's comments and approvals from the API, kept fresh (loaded with
 * the board, again when the window gets focus, and every REVIEW_POLL_MS while a Preview editor or the Review panel is
 * open), and the helpers that sort them into threads.
 */
import { computeLayout, previewFingerprint, type LayoutDeps, type ProjectDoc, type TeamRole } from '@smart-canvas/core';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export const REVIEW_POLL_MS = 30_000;

export interface ReviewComment {
  id: string;
  outputId: string;
  parentId: string | null;
  text: string;
  pinX: number | null;
  pinY: number | null;
  authorId: string | null;
  author: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Approval {
  outputId: string;
  fingerprint: string;
  approvedBy: string | null;
  approvedAt: string;
}
export interface ReviewData {
  comments: ReviewComment[];
  approvals: Approval[];
}

export interface Thread {
  comment: ReviewComment;
  replies: ReviewComment[];
  /** 1-based, in the order threads were started on this Preview (pins show it). */
  n: number;
}

/** The threads on one Preview, oldest first; resolved ones only when `resolved` is true. */
export function threadsOf(data: ReviewData | null, outputId: string, resolved = false): Thread[] {
  const all = (data?.comments ?? []).filter((c) => c.outputId === outputId);
  return all
    .filter((c) => !c.parentId)
    .map((comment, i) => ({ comment, replies: all.filter((r) => r.parentId === comment.id), n: i + 1 }))
    .filter((t) => resolved || !t.comment.resolvedAt);
}

/** Open (unresolved) threads per Preview. */
export function openCounts(data: ReviewData | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of data?.comments ?? []) if (!c.parentId && !c.resolvedAt) counts.set(c.outputId, (counts.get(c.outputId) ?? 0) + 1);
  return counts;
}

/** D63: a Preview's approval as it stands: approved as it looks now, changed since, or not approved. */
export interface ApprovalState {
  state: 'approved' | 'changed' | 'none';
  approval?: Approval;
}
const NONE: ApprovalState = { state: 'none' };

/** The fingerprint of what output `outputId` draws now ('' until the layout can be computed). */
export function fingerprintOf(doc: ProjectDoc, outputId: string, deps: LayoutDeps | null): string {
  return deps && doc.outputs.some((o) => o.id === outputId) ? previewFingerprint(doc, outputId, computeLayout(doc, outputId, deps)) : '';
}

/** Each approved Preview's state (only those are laid out; a Preview not listed is not approved). */
export function approvalStates(doc: ProjectDoc, deps: LayoutDeps | null, data: ReviewData | null): Map<string, ApprovalState> {
  const states = new Map<string, ApprovalState>();
  for (const a of data?.approvals ?? []) {
    if (!doc.outputs.some((o) => o.id === a.outputId)) continue;
    const now = fingerprintOf(doc, a.outputId, deps);
    // Until fonts are in (no layout yet) an approval reads as approved, not as changed.
    states.set(a.outputId, { state: !now || now === a.fingerprint ? 'approved' : 'changed', approval: a });
  }
  return states;
}

export const approvalOf = (states: ReadonlyMap<string, ApprovalState>, outputId: string): ApprovalState => states.get(outputId) ?? NONE;

/** approvalStates for the board, a beat behind edits (like the thumbnails) so typing stays quick. */
export function useApprovalStates(doc: ProjectDoc, deps: LayoutDeps | null, data: ReviewData | null): Map<string, ApprovalState> {
  const shown = useDeferredValue(doc);
  return useMemo(() => approvalStates(shown, deps, data), [shown, deps, data]);
}

/** What the signed-in person may do with a comment (the API checks the same). */
export function mayOnComment(c: ReviewComment, me: { userId: string; role: TeamRole }) {
  const mine = c.authorId === me.userId;
  return { edit: mine, resolve: !c.parentId && (mine || me.role !== 'viewer'), remove: mine || me.role === 'admin' };
}

/** The review of the project at `url` (its API path). `active`: poll while someone is looking at comments. */
export function useReview(url: string, active: boolean): { data: ReviewData | null; reload: () => void } {
  const [data, setData] = useState<ReviewData | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<ReviewData>('GET', `${url}/review`).then(
      (d) => live && setData(d),
      () => undefined, // keep what we have; the next load tries again
    );
    return () => {
      live = false;
    };
  }, [url, tick]);
  useEffect(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, REVIEW_POLL_MS);
    return () => clearInterval(t);
  }, [active, reload]);
  return { data, reload };
}

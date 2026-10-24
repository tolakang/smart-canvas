import { describe, expect, it } from 'vitest';
import { mayOnComment, openCounts, threadsOf, type ReviewComment, type ReviewData } from './review';

const c = (id: string, patch: Partial<ReviewComment> = {}): ReviewComment => ({
  id,
  outputId: 'o1',
  parentId: null,
  text: id,
  pinX: null,
  pinY: null,
  authorId: 'ada',
  author: 'Ada',
  resolvedAt: null,
  resolvedBy: null,
  createdAt: '2026-10-24T07:00:00Z',
  updatedAt: '2026-10-24T07:00:00Z',
  ...patch,
});

describe('review helpers (D63)', () => {
  const data: ReviewData = {
    comments: [c('a', { pinX: 0.5, pinY: 0.5 }), c('a1', { parentId: 'a' }), c('b', { resolvedAt: 'x' }), c('c'), c('d', { outputId: 'o2' })],
    approvals: [],
  };

  it('threads per Preview, numbered in the order they were started (resolved ones keep their number)', () => {
    expect(threadsOf(data, 'o1').map((t) => [t.comment.id, t.n, t.replies.map((r) => r.id)])).toEqual([
      ['a', 1, ['a1']],
      ['c', 3, []],
    ]);
    expect(threadsOf(data, 'o1', true).map((t) => t.comment.id)).toEqual(['a', 'b', 'c']);
    expect(threadsOf(null, 'o1')).toEqual([]);
  });

  it('counts open threads per Preview, not replies or resolved ones', () => {
    expect([...openCounts(data)]).toEqual([
      ['o1', 2],
      ['o2', 1],
    ]);
  });

  it('the author edits; the author or an editor resolves a thread; the author or an admin deletes', () => {
    const mine = c('m', { authorId: 'vee' });
    const theirs = c('t');
    expect(mayOnComment(mine, { userId: 'vee', role: 'viewer' })).toEqual({ edit: true, resolve: true, remove: true });
    expect(mayOnComment(theirs, { userId: 'vee', role: 'viewer' })).toEqual({ edit: false, resolve: false, remove: false });
    expect(mayOnComment(theirs, { userId: 'ed', role: 'editor' })).toEqual({ edit: false, resolve: true, remove: false });
    expect(mayOnComment(theirs, { userId: 'boss', role: 'admin' })).toEqual({ edit: false, resolve: true, remove: true });
    expect(mayOnComment(c('r', { parentId: 'a', authorId: 'ed' }), { userId: 'ed', role: 'editor' }).resolve).toBe(false);
  });
});

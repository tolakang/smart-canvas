import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History (undo/redo)', () => {
  it('undoes and redoes in order; a new edit clears redo', () => {
    const h = new History<string>();
    h.record('a', null, 0); // a → b
    h.record('b', null, 1000); // b → c
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeNull();
    expect(h.redo('a')).toBe('b');
    h.record('b', null, 5000); // b → x
    expect(h.canRedo).toBe(false);
    expect(h.undo('x')).toBe('b');
  });

  it('coalesces quick edits under the same key (typing), not different keys or slow ones', () => {
    const h = new History<string>();
    h.record('', 'text:h', 0); // '' → 'H'
    h.record('H', 'text:h', 100); // 'H' → 'Hi'
    h.record('Hi', 'text:h', 200); // 'Hi' → 'Hi!'
    expect(h.undo('Hi!')).toBe('');
    const g = new History<string>();
    g.record('a', 'x', 0);
    g.record('b', 'y', 100);
    g.record('c', 'y', 5000);
    expect([g.undo('d'), g.undo('c'), g.undo('b')]).toEqual(['c', 'b', 'a']);
  });

  it('keeps at most `limit` steps', () => {
    const h = new History<number>(3);
    for (let i = 0; i < 5; i++) h.record(i, null, i * 1000);
    expect([h.undo(5), h.undo(4), h.undo(3), h.undo(2)]).toEqual([4, 3, 2, null]);
  });
});

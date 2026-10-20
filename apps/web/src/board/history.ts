/**
 * Undo / redo (T7.2, O6: board and editor edits, per session). Snapshots of the whole ProjectDoc —
 * cheap, since every edit already produces a new immutable doc. Edits that follow each other within
 * `coalesceMs` under the same key (typing in one field) become one step.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastAt = -Infinity;

  constructor(
    private readonly limit = 100,
    private readonly coalesceMs = 600,
  ) {}

  /** Records that `before` was replaced by a new state. */
  record(before: T, key: string | null = null, now = Date.now()): void {
    const merge = key !== null && key === this.lastKey && now - this.lastAt < this.coalesceMs && this.past.length > 0;
    if (!merge) {
      this.past.push(before);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.lastKey = key;
    this.lastAt = now;
  }

  /** The state to go back to (current goes to redo), or null. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastKey = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

/**
 * Autosave with the server's optimistic lock (rev).
 * - Changes are debounced; only the latest doc is sent.
 * - At most one save is in flight; edits made meanwhile are sent right after it returns.
 * - 409 (someone saved a newer rev) stops autosave: the UI offers "reload latest".
 * - Other failures retry with backoff, keeping the latest doc.
 */
import type { ProjectDoc } from '@smart-canvas/core';

export type SaveState = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';

export interface SaveFn {
  (rev: number, doc: ProjectDoc): Promise<{ rev: number }>;
}

export interface AutosaveOptions {
  rev: number;
  save: SaveFn;
  isConflict: (err: unknown) => boolean;
  onState?: (state: SaveState) => void;
  delayMs?: number;
  maxRetryMs?: number;
}

export class Autosave {
  rev: number;
  state: SaveState = 'saved';
  private pending: ProjectDoc | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private retryMs: number;
  private readonly delayMs: number;
  private readonly maxRetryMs: number;

  constructor(private readonly opts: AutosaveOptions) {
    this.rev = opts.rev;
    this.delayMs = opts.delayMs ?? 800;
    this.maxRetryMs = opts.maxRetryMs ?? 30_000;
    this.retryMs = this.delayMs;
  }

  /** Queue the latest doc; it is saved after `delayMs` without further changes. */
  change(doc: ProjectDoc): void {
    if (this.state === 'conflict') return;
    this.pending = doc;
    this.set(this.inFlight ? 'saving' : 'pending');
    this.arm(this.delayMs);
  }

  /** Save now (e.g. when the page is hidden). Resolves when nothing is pending or a save failed. */
  async flush(): Promise<void> {
    this.disarm();
    while (this.state !== 'conflict') {
      if (this.inFlight) await this.inFlight;
      else if (this.pending) await this.run();
      else return;
      if (this.state === 'error') return;
    }
  }

  dispose(): void {
    this.disarm();
  }

  private arm(ms: number) {
    this.disarm();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private disarm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): Promise<void> {
    if (this.inFlight || !this.pending || this.state === 'conflict') return this.inFlight ?? Promise.resolve();
    const doc = this.pending;
    this.pending = null;
    this.set('saving');
    this.inFlight = this.opts
      .save(this.rev, doc)
      .then(
        (res) => {
          this.rev = res.rev;
          this.retryMs = this.delayMs;
          this.set(this.pending ? 'pending' : 'saved');
        },
        (err: unknown) => {
          if (this.opts.isConflict(err)) {
            this.pending = null;
            this.set('conflict');
            return;
          }
          this.pending ??= doc; // keep the newest doc for the retry
          this.set('error');
          this.arm(this.retryMs);
          this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
        },
      )
      .finally(() => {
        this.inFlight = null;
        // Edits that arrived during the save go out right away.
        if (this.pending && this.state === 'pending') void this.run();
      });
    return this.inFlight;
  }

  private set(state: SaveState) {
    if (this.state === state) return;
    this.state = state;
    this.opts.onState?.(state);
  }
}

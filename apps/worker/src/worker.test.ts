import { describe, expect, it } from 'vitest';
import { WORKER_NAME } from './worker';

describe('worker scaffold', () => {
  it('has a name', () => {
    expect(WORKER_NAME).toBe('export-worker');
  });
});

import { describe, expect, it } from 'vitest';
import { timeAgo } from './Projects';

describe('timeAgo (project rows)', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now);
  it('stays short enough for one line', () => {
    expect(ago(20_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 min ago');
    expect(ago(3 * 3_600_000)).toBe('3 h ago');
    expect(ago(30 * 3_600_000)).toBe('yesterday');
    expect(ago(4 * 86_400_000)).toBe('4 days ago');
    expect(ago(40 * 86_400_000)).not.toMatch(/ago|:/);
  });
});

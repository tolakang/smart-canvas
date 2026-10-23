import { describe, expect, it } from 'vitest';
import { shownProjects, tileColor, timeAgo } from './Projects';

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

describe('project list: search, sort, tiles (T16.2)', () => {
  const rows = [
    { name: 'Travo', updatedAt: '2026-10-22T10:00:00Z' },
    { name: 'a sale', updatedAt: '2026-10-23T09:00:00Z' },
    { name: 'Travo-1', updatedAt: '2026-10-22T11:00:00Z' },
    { name: 'B', updatedAt: '2026-10-23T08:00:00Z' },
  ];
  it('last edited first by default; by name ignoring case, numbers in order', () => {
    expect(shownProjects(rows, '', 'edited').map((r) => r.name)).toEqual(['a sale', 'B', 'Travo-1', 'Travo']);
    expect(shownProjects(rows, '', 'name').map((r) => r.name)).toEqual(['a sale', 'B', 'Travo', 'Travo-1']);
  });
  it('search matches any part of the name, any case; the list itself is not changed', () => {
    expect(shownProjects(rows, ' trav ', 'name').map((r) => r.name)).toEqual(['Travo', 'Travo-1']);
    expect(shownProjects(rows, 'zzz', 'edited')).toEqual([]);
    expect(rows[0]?.name).toBe('Travo');
  });
  it('a name keeps its tile colour', () => expect(tileColor('Travo')).toBe(tileColor('Travo')));
});

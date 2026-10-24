import { describe, expect, it } from 'vitest';
import { dayOf, versionTitle } from './HistoryPanel';

describe('project history labels (D62)', () => {
  it('says what each kind of version is', () => {
    expect(versionTitle({ kind: 'auto', label: '' })).toBe('Auto-saved');
    expect(versionTitle({ kind: 'before-delete', label: '1 input and 2 sizes' })).toBe('Before deleting 1 input and 2 sizes');
    expect(versionTitle({ kind: 'before-restore', label: '' })).toBe('Before restore');
    expect(versionTitle({ kind: 'named', label: 'Sent to client' })).toBe('Sent to client');
  });

  it('groups by Today, Yesterday, then the date (with the year only when it is another year)', () => {
    const now = new Date(2026, 9, 24, 9, 0);
    expect(dayOf(new Date(2026, 9, 24, 0, 5).toISOString(), now)).toBe('Today');
    expect(dayOf(new Date(2026, 9, 23, 23, 55).toISOString(), now)).toBe('Yesterday');
    expect(dayOf(new Date(2026, 9, 20, 12).toISOString(), now)).not.toMatch(/2026/);
    expect(dayOf(new Date(2025, 9, 20, 12).toISOString(), now)).toMatch(/2025/);
  });
});

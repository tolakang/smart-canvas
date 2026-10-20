import { describe, expect, it } from 'vitest';
import { screenOf } from './responsive';

describe('screenOf (D33)', () => {
  it('phone wins over tablet; neither = desktop', () => {
    expect(screenOf(true, true)).toBe('phone');
    expect(screenOf(false, true)).toBe('tablet');
    expect(screenOf(false, false)).toBe('desktop');
  });
});

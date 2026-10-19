import { describe, expect, it } from 'vitest';
import { presets } from './index';

describe('presets scaffold', () => {
  it('exports a preset list', () => {
    expect(Array.isArray(presets)).toBe(true);
  });
});

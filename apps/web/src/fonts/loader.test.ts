import type { TextStyle } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { cachedMeasure } from './loader';

const style: TextStyle = { fontFamily: 'Inter', fontWeight: 400, fontSizePx: 20, color: '#000', align: 'left', maxLines: 1 };

describe('cachedMeasure (T7.4)', () => {
  it('measures each text/font once', () => {
    let calls = 0;
    const measure = cachedMeasure((text, px) => (calls++, text.length * px));
    expect(measure('Sale', 10, style)).toBe(40);
    expect(measure('Sale', 10, style)).toBe(40);
    expect(calls).toBe(1);
    expect(measure('Sale', 12, style)).toBe(48);
    expect(measure('Sale', 10, { ...style, fontWeight: 700 })).toBe(40);
    expect(measure('Sale', 10, { ...style, letterSpacingEm: 0.1 })).toBe(40);
    expect(calls).toBe(4);
  });

  it('drops the oldest entry when full', () => {
    let calls = 0;
    const measure = cachedMeasure((text) => (calls++, text.length), 2);
    measure('a', 10, style);
    measure('bb', 10, style);
    measure('ccc', 10, style); // evicts 'a'
    measure('bb', 10, style);
    expect(calls).toBe(3);
    measure('a', 10, style);
    expect(calls).toBe(4);
  });
});

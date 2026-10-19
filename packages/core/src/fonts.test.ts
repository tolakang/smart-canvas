import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS, cssFont, fontStack, quoteFamily } from './fonts';
import { DEFAULT_TEXT_STYLE } from './sources';

describe('fonts', () => {
  it('bundles Latin and Khmer families, and the default text style uses one of them', () => {
    expect(BUNDLED_FONTS.some((f) => f.scripts.includes('khmer'))).toBe(true);
    expect(BUNDLED_FONTS.map((f) => f.family)).toContain(DEFAULT_TEXT_STYLE.fontFamily);
  });

  it('stacks the chosen family before the bundled Khmer/Latin fallbacks, without duplicates', () => {
    expect(fontStack('My Brand')).toBe('"My Brand", "Noto Sans Khmer", "Noto Sans", sans-serif');
    expect(fontStack('Noto Sans')).toBe('"Noto Sans", "Noto Sans Khmer", sans-serif');
  });

  it('quotes hostile family names safely', () => {
    expect(quoteFamily('A "B" \\ C')).toBe('"A \\"B\\" \\\\ C"');
    expect(quoteFamily('x\u0000y\nz')).toBe('"xyz"');
  });

  it('builds the CSS font shorthand', () => {
    expect(cssFont({ fontFamily: 'Kantumruy Pro', fontWeight: 700 }, 48)).toBe(
      '700 48px "Kantumruy Pro", "Noto Sans Khmer", "Noto Sans", sans-serif',
    );
  });
});

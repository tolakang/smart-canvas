import { describe, expect, it } from 'vitest';
import { presets } from './index';

describe('built-in presets', () => {
  it('has social (px) and print (mm, 300 dpi, 3 mm bleed) groups', () => {
    const social = presets.filter((p) => p.group === 'social');
    const print = presets.filter((p) => p.group === 'print');
    expect(social.length).toBeGreaterThan(5);
    expect(print.length).toBeGreaterThan(5);
    for (const p of social) expect(p.size.unit).toBe('px');
    for (const p of print) expect(p).toMatchObject({ size: { unit: 'mm' }, dpi: 300, bleedMm: 3 });
  });

  it('uses unique UUID ids and unique names, all built-in', () => {
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
    expect(new Set(presets.map((p) => p.name)).size).toBe(presets.length);
    for (const p of presets) {
      expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(p.teamId).toBeNull();
      expect(p.size.width).toBeGreaterThan(0);
      expect(p.size.height).toBeGreaterThan(0);
    }
  });

  it('includes the reference sizes from the spec', () => {
    const find = (name: string) => presets.find((p) => p.name === name)?.size;
    expect(find('Instagram portrait 4:5')).toEqual({ width: 1080, height: 1350, unit: 'px' });
    expect(find('A4')).toEqual({ width: 210, height: 297, unit: 'mm' });
  });
});

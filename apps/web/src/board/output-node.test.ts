import { describe, expect, it } from 'vitest';
import type { OutputNode, SizePreset } from '@smart-canvas/core';
import { presetSettings, unitSettings } from './OutputNode';

const out = (patch: Partial<OutputNode> = {}): OutputNode => ({
  id: 'o1',
  label: 'O',
  size: { width: 1080, height: 1350, unit: 'px' },
  family: 'auto',
  overrides: [],
  board: { x: 0, y: 0 },
  ...patch,
});

describe('output node settings', () => {
  it('px/mm toggle keeps the physical size and adds print dpi the first time', () => {
    expect(unitSettings(out(), 'mm')).toEqual({ size: { width: 285.8, height: 357.2, unit: 'mm' }, dpi: 300 });
    expect(unitSettings(out({ dpi: 150 }), 'mm')).toEqual({ size: { width: 285.8, height: 357.2, unit: 'mm' } });
    expect(unitSettings(out({ size: { width: 210, height: 297, unit: 'mm' } }), 'px')).toEqual({ size: { width: 794, height: 1123, unit: 'px' } });
    expect(unitSettings(out(), 'px')).toEqual({});
  });

  it('a preset sets size, dpi and bleed', () => {
    const a4: SizePreset = { id: 'a4', teamId: null, group: 'print', name: 'A4', size: { width: 210, height: 297, unit: 'mm' }, bleedMm: 3 };
    expect(presetSettings(a4)).toEqual({ presetId: 'a4', size: a4.size, dpi: 300, bleedMm: 3 });
    const post: SizePreset = { id: 'ig', teamId: null, group: 'social', name: 'Post', size: { width: 1080, height: 1080, unit: 'px' } };
    expect(presetSettings(post)).toEqual({ presetId: 'ig', size: post.size, bleedMm: 0 });
  });
});

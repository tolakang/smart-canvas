import type { SizePreset } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { familiesOf } from './PresetsDialog';

const p = (name: string, family: string | undefined, teamId: string | null): SizePreset =>
  ({ id: name, teamId, group: 'social', name, ...(family ? { family } : {}), size: { width: 1, height: 1, unit: 'px' } }) as SizePreset;

describe('familiesOf (M4)', () => {
  it('groups sizes by family in list order; single sizes are left out; any built-in size makes it built-in', () => {
    const f = familiesOf([p('a', 'GDN', null), p('b', undefined, 't'), p('c', 'Shop', 't'), p('d', 'GDN', null), p('e', 'Shop', 't')]);
    expect(f.map((x) => [x.name, x.builtIn, x.sizes.map((s) => s.name)])).toEqual([
      ['GDN', true, ['a', 'd']],
      ['Shop', false, ['c', 'e']],
    ]);
  });
});

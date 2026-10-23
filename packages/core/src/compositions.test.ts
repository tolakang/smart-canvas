import { describe, expect, it } from 'vitest';
import { setCompositionSize } from './compositions';
import { compositionById } from './graph';
import type { ProjectDoc } from './model';
import { createProjectDoc } from './project';
import type { SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe('the master preview (D56)', () => {
  it('resizes; a size of zero or an unknown composition is refused', () => {
    const doc = ok(setCompositionSize(createProjectDoc('P'), 'main', { width: 1080, height: 1920, unit: 'px' }));
    expect(compositionById(doc, 'main')).toMatchObject({ size: { width: 1080, height: 1920, unit: 'px' } });
    expect(setCompositionSize(doc, 'main', { width: 0, height: 10, unit: 'px' })).toEqual({ ok: false, error: 'invalid' });
    expect(setCompositionSize(doc, 'nope', { width: 10, height: 10, unit: 'px' })).toEqual({ ok: false, error: 'not_found' });
  });
});

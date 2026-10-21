import { describe, expect, it } from 'vitest';
import { project } from './layout/test-doc';
import type { TransformHistory } from './model';
import { layerTransform, setLayerTransform } from './transform-history';

const history = (dx = 0): TransformHistory => ({
  origin: { x: 100, y: 100, width: 40, height: 30, scaleX: 1, scaleY: 1, rotation: 0, shear: 0 },
  ops: [{ type: 'move', dx, dy: 0 }],
});
const scene = { width: 3000, height: 3000 };

describe('saved editor transform histories (D37)', () => {
  it('saves and reads a composition layer history', () => {
    const doc = project();
    const result = setLayerTransform(doc, 'subject', history(10), { compositionId: 'main' }, scene);
    if (!result.ok) throw new Error(result.error);
    expect(layerTransform(result.doc, 'subject', { compositionId: 'main' }, scene)).toEqual(history(10));
    expect(layerTransform(result.doc, 'subject', { compositionId: 'main' }, { width: 3000, height: 2000 })).toBeUndefined();
  });

  it('keeps a layer history per output', () => {
    const doc = project();
    const result = setLayerTransform(doc, 'subject', history(5), { outputId: 'o1' }, { width: 1080, height: 1350 });
    if (!result.ok) throw new Error(result.error);
    expect(layerTransform(result.doc, 'subject', { outputId: 'o1' }, { width: 1080, height: 1350 })).toEqual(history(5));
    expect(layerTransform(result.doc, 'subject', { compositionId: 'main' }, scene)).toBeUndefined();
  });

  it('drops old histories when the scene size changes and keeps the others otherwise', () => {
    const first = setLayerTransform(project(), 'subject', history(1), { compositionId: 'main' }, scene);
    if (!first.ok) throw new Error(first.error);
    const second = setLayerTransform(first.doc, 'logo', history(2), { compositionId: 'main' }, scene);
    if (!second.ok) throw new Error(second.error);
    expect(Object.keys(second.doc.compositions[0]?.transforms?.layers ?? {}).sort()).toEqual(['logo', 'subject']);
    // A different scene size invalidates the old pixel coordinates, so only the new layer remains.
    const resized = setLayerTransform(second.doc, 'logo', history(3), { compositionId: 'main' }, { width: 2000, height: 2000 });
    if (!resized.ok) throw new Error(resized.error);
    expect(Object.keys(resized.doc.compositions[0]?.transforms?.layers ?? {})).toEqual(['logo']);
  });

  it('reports an unknown scene', () => {
    expect(setLayerTransform(project(), 'subject', history(), { compositionId: 'nope' }, scene)).toEqual({ ok: false, error: 'not_found' });
    expect(setLayerTransform(project(), 'subject', history(), { outputId: 'nope' }, scene)).toEqual({ ok: false, error: 'not_found' });
  });
});

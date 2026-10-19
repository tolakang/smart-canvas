import { createProjectDoc, type InputSource } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { addStop, removeStop, setAsset, setFill, setStop, setText, switchFillType, withSource } from './content';

const text: InputSource = {
  id: 'head',
  label: 'Headline',
  kind: 'text',
  behavesLike: 'text',
  port: 0,
  visible: true,
  content: {
    kind: 'text',
    text: 'Hi',
    style: { fontFamily: 'Inter', fontWeight: 700, fontSizePx: 100, color: '#000', align: 'center', maxLines: 2 },
  },
  board: { x: 0, y: 0 },
};
const image: InputSource = { ...text, id: 'img', kind: 'image', content: { kind: 'image', assetId: null, focal: { x: 0.5, y: 0.5 } } };
const fill: InputSource = { ...text, id: 'bg', kind: 'fill', content: { kind: 'fill', fill: { type: 'solid', color: '#ff0000' } } };

describe('source edits', () => {
  it('withSource replaces only the matching source, and is a no-op for unknown ids', () => {
    const doc = { ...createProjectDoc('P'), sources: [text, image] };
    const next = withSource(doc, 'head', (s) => setText(s, 'Hello'));
    expect(next.sources[0]?.content).toMatchObject({ kind: 'text', text: 'Hello' });
    expect(next.sources[1]).toBe(image);
    expect(withSource(doc, 'nope', (s) => s)).toBe(doc);
  });

  it('each setter only applies to its own content kind and keeps the rest', () => {
    expect(setText(text, 'x').content).toMatchObject({ text: 'x', style: { fontSizePx: 100 } });
    expect(setText(image, 'x')).toBe(image);
    expect(setAsset(image, 'a1').content).toEqual({ kind: 'image', assetId: 'a1', focal: { x: 0.5, y: 0.5 } });
    expect(setAsset(text, 'a1')).toBe(text);
    expect(setFill(fill, { type: 'solid', color: '#000' }).content).toEqual({ kind: 'fill', fill: { type: 'solid', color: '#000' } });
    expect(setFill(text, { type: 'solid', color: '#000' })).toBe(text);
  });
});

describe('fill helpers', () => {
  it('switching type keeps the chosen colour', () => {
    const lin = switchFillType({ type: 'solid', color: '#ff0000' }, 'linear');
    expect(lin).toEqual({ type: 'linear', angleDeg: 180, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#ffffff' }] });
    expect(switchFillType(lin, 'solid')).toEqual({ type: 'solid', color: '#ff0000' });
    expect(switchFillType(lin, 'linear')).toBe(lin);
  });

  it('edits, adds and removes stops; never fewer than two', () => {
    const lin = { type: 'linear' as const, angleDeg: 90, stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] };
    expect(setStop(lin, 1, { color: '#00f' }).stops[1]).toEqual({ offset: 1, color: '#00f' });
    expect(setStop(lin, 0, { offset: 7 }).stops[0]?.offset).toBe(1); // clamped to 0..1
    const three = addStop(lin);
    expect(three.stops).toEqual([{ offset: 0, color: '#000' }, { offset: 0.5, color: '#000' }, { offset: 1, color: '#fff' }]);
    expect(addStop(three).stops.map((s) => s.offset)).toEqual([0, 0.25, 0.5, 1]);
    expect(removeStop(three, 1).stops).toHaveLength(2);
    expect(removeStop(lin, 0)).toBe(lin);
  });

});

import { createBoardProject, type OutputNode, type ProjectDoc } from '@smart-canvas/core';
import { describe, expect, it } from 'vitest';
import { hasArtwork, THUMB_EDGE, thumbnailOptions, thumbnailOutput } from './thumbnail';

const out = (id: string, width: number, height: number, unit: 'px' | 'mm' = 'px') => ({ id, label: id, size: { width, height, unit } }) as OutputNode;
const withOutputs = (outputs: OutputNode[]): ProjectDoc => ({ ...createBoardProject('T'), outputs });

describe('project thumbnail (D64)', () => {
  it('draws the Preview closest to the card shape, the first one on a tie, and none without Previews', () => {
    expect(thumbnailOutput(withOutputs([]))).toBeNull();
    expect(thumbnailOutput(withOutputs([out('story', 1080, 1920), out('banner', 1500, 500), out('hd', 1920, 1080)]))?.id).toBe('hd');
    expect(thumbnailOutput(withOutputs([out('a', 1080, 1080), out('b', 500, 500)]))?.id).toBe('a');
  });

  it('draws the long edge at THUMB_EDGE px, never larger than the Preview', () => {
    expect(thumbnailOptions(out('hd', 1920, 1080))).toMatchObject({ scale: THUMB_EDGE / 1920, withBleed: false });
    expect(thumbnailOptions(out('small', 320, 100)).scale).toBe(1);
    // A4 portrait: 297 mm is 1122.5 design px; dpi so that edge lands on THUMB_EDGE.
    const a4 = thumbnailOptions(out('a4', 210, 297, 'mm'));
    expect(a4.scale).toBeUndefined();
    expect(((297 / 25.4) * (a4.dpi ?? 0))).toBeCloseTo(THUMB_EDGE, 5);
  });

  it('a blank board has no artwork; some text or a picture is', () => {
    const blank = createBoardProject('T');
    expect(hasArtwork(blank)).toBe(false);
    const text = blank.sources.find((s) => s.content.kind === 'text');
    if (!text || text.content.kind !== 'text') throw new Error('no text input');
    const withText = { ...blank, sources: blank.sources.map((s) => (s.id === text.id ? { ...s, content: { ...text.content, text: 'Hi' } } : s)) };
    expect(hasArtwork(withText)).toBe(true);
    expect(hasArtwork({ ...withText, sources: withText.sources.map((s) => ({ ...s, visible: false })) })).toBe(false);
  });
});

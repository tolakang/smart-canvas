import { describe, expect, it } from 'vitest';
import { fillToCss } from './css';
import type { ProjectDoc } from './model';
import { connectSource } from './ports';
import { createProjectDoc } from './project';
import { masterScene, sizeInDesignPx, toDesignFrame } from './render';
import { setSourceVisible } from './sources';
import { applyTransform, isKhmerText, lineHeightOf, withKhmerBreaks } from './text';

const ok = (r: { ok: true; doc: ProjectDoc } | { ok: false }) => {
  if (!r.ok) throw new Error('op failed');
  return r.doc;
};

describe('fillToCss', () => {
  it('renders solid and linear fills with stops sorted in percent', () => {
    expect(fillToCss({ type: 'solid', color: '#abc' })).toBe('#abc');
    expect(fillToCss({ type: 'linear', angleDeg: 45, stops: [{ offset: 1, color: '#fff' }, { offset: 0.333, color: '#000' }] })).toBe(
      'linear-gradient(45deg, #000 33.3%, #fff 100%)',
    );
  });
});

describe('text helpers', () => {
  it('detects Khmer by language or content, and picks the line height (1.2 latin, 1.6 khmer)', () => {
    expect(isKhmerText({ language: 'auto' }, 'Hello')).toBe(false);
    expect(isKhmerText({ language: 'auto' }, 'Hi សួស្តី')).toBe(true);
    expect(isKhmerText({ language: 'en' }, 'សួស្តី')).toBe(false);
    expect(isKhmerText({ language: 'km' }, 'Hi')).toBe(true);
    expect(lineHeightOf({ language: 'auto' }, 'Hello')).toBe(1.2);
    expect(lineHeightOf({ language: 'auto' }, 'សួស្តី')).toBe(1.6);
    expect(lineHeightOf({ language: 'auto', lineHeight: 1.05 }, 'សួស្តី')).toBe(1.05);
  });

  it('marks Khmer word boundaries with zero-width spaces, never inside a word, and leaves Latin alone', () => {
    const marked = withKhmerBreaks('សួស្តីកម្ពុជា');
    expect(marked.replaceAll('​', '')).toBe('សួស្តីកម្ពុជា');
    expect(marked.split('​').length).toBeGreaterThan(1);
    // Every piece is a whole Segmenter word.
    const words = [...new Intl.Segmenter('km', { granularity: 'word' }).segment('សួស្តីកម្ពុជា')].map((w) => w.segment);
    expect(marked.split('​')).toEqual(words);
    expect(withKhmerBreaks('Grand opening')).toBe('Grand opening');
  });

  it('applies uppercase', () => {
    expect(applyTransform('Sale', { textTransform: 'uppercase' })).toBe('SALE');
    expect(applyTransform('Sale', {})).toBe('Sale');
  });
});

describe('masterScene', () => {
  it('maps normalized placements to design px', () => {
    expect(sizeInDesignPx({ width: 210, height: 297, unit: 'mm' }).width).toBeCloseTo(793.7, 1);
    expect(toDesignFrame({ x: 0.1, y: 0.2, w: 0.5, h: 0.25, rotation: 15 }, { width: 3000, height: 2000 })).toEqual({
      x: 300,
      y: 400,
      w: 1500,
      h: 500,
      rotation: 15,
    });
  });

  it('draws only wired, visible inputs, back→front, with unplaced backgrounds covering the canvas', () => {
    let doc = createProjectDoc('P');
    doc.master.placements = { subject: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, headline: { x: 0.1, y: 0.8, w: 0.8, h: 0.1 } };
    expect(masterScene(doc).items).toEqual([]); // nothing wired yet
    for (const id of ['background', 'subject', 'headline', 'logo']) doc = ok(connectSource(doc, id));
    doc = ok(setSourceVisible(doc, 'headline', false));
    const scene = masterScene(doc);
    expect(scene).toMatchObject({ width: 3000, height: 3000 });
    // logo (port 0) is wired but has no placement and is not a background → skipped
    expect(scene.items).toEqual([
      { sourceId: 'background', frame: { x: 0, y: 0, w: 3000, h: 3000 } },
      { sourceId: 'subject', frame: { x: 750, y: 750, w: 1500, h: 1500 } },
    ]);
  });
});

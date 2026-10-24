import { describe, expect, it } from 'vitest';
import { mainComposition } from './graph';
import { DEFAULTS } from './model';
import { createProjectDoc, copyProjectDoc } from './project';

describe('createProjectDoc', () => {
  it('starts at rev 0 with the default master size, the 4 default inputs and nothing wired', () => {
    const doc = createProjectDoc('Poster');
    expect(doc).toMatchObject({ schema: 4, rev: 0, name: 'Poster', outputs: [], edges: [] });
    expect(doc.sources.map((s) => s.label)).toEqual(['Background', 'Subject', 'Headline', 'Logo']);
    expect(mainComposition(doc)).toMatchObject({ id: 'main', size: { width: 3000, height: 3000, unit: 'px' }, layers: ['logo', 'headline', 'subject', 'background'] });
  });

  it('does not share the defaults object', () => {
    mainComposition(createProjectDoc('a')).size.width = 1;
    expect(DEFAULTS.masterSize.width).toBe(3000);
  });
});

describe('copyProjectDoc', () => {
  it('copies everything under a new name at rev 0, detached from the original', () => {
    const doc = { ...createProjectDoc('Poster'), rev: 7 };
    const copy = copyProjectDoc(doc, '  Poster (copy) ');
    expect(copy).toEqual({ ...doc, name: 'Poster (copy)', rev: 0 });
    const first = copy.sources[0];
    if (first) first.label = 'changed';
    expect(doc.sources[0]?.label).not.toBe('changed');
    expect(copyProjectDoc(doc, ' ').name).toBe('Poster');
  });
});

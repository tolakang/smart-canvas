import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './model';
import { createProjectDoc } from './project';

describe('createProjectDoc', () => {
  it('starts at rev 0 with the default master size, the 4 default inputs and nothing wired', () => {
    const doc = createProjectDoc('Poster');
    expect(doc).toMatchObject({ schema: 1, rev: 0, name: 'Poster', outputs: [], wires: [] });
    expect(doc.sources.map((s) => s.label)).toEqual(['Background', 'Subject', 'Headline', 'Logo']);
    expect(doc.master.size).toEqual({ width: 3000, height: 3000, unit: 'px' });
  });

  it('does not share the defaults object', () => {
    createProjectDoc('a').master.size.width = 1;
    expect(DEFAULTS.masterSize.width).toBe(3000);
  });
});

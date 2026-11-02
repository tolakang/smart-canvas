import { describe, expect, it } from 'vitest';
import { MAIN, mainComposition, withComposition } from './graph';
import { addLanguagePair } from './languages';
import { layerGroup, layerOrderOf, moveLayerGroup, orderLayers } from './layer-order';
import { output, project } from './layout/test-doc';
import type { ProjectDoc } from './model';
import { addSource, type SourceResult } from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const rows = (doc: ProjectDoc) => mainComposition(doc).layers;
const withRows = (doc: ProjectDoc, layers: string[]) => withComposition(doc, MAIN, (c) => ({ ...c, layers }));

describe('layer comp order: logo, headline, text, image, background (D45, D73)', () => {
  it('groups by behaviour; a Headline card\'s pictures are the headline; text is its own group (D73)', () => {
    expect(layerGroup({ id: 'a', behavesLike: 'logo' })).toBe('logo');
    expect(layerGroup({ id: 'a', behavesLike: 'text' })).toBe('text');
    expect(layerGroup({ id: 'a', behavesLike: 'subject' }, new Set(['a']))).toBe('headline');
    expect(layerGroup({ id: 'a', behavesLike: 'decoration' })).toBe('elements');
    expect(layerGroup({ id: 'a', behavesLike: 'background' })).toBe('background');
  });

  it('D73: an order saved with the four old groups reads with Text right behind Headline', () => {
    expect(layerOrderOf({ layerOrder: ['elements', 'logo', 'headline', 'background'] as never })).toEqual(['elements', 'logo', 'headline', 'text', 'background']);
    expect(layerOrderOf({ layerOrder: ['headline', 'logo', 'elements', 'background'] as never })).toEqual(['headline', 'text', 'logo', 'elements', 'background']);
    expect(layerOrderOf({})).toEqual(['logo', 'headline', 'text', 'elements', 'background']);
    // Moving a group stores all five.
    expect(moveLayerGroup(project(output()), 'text', 0).layerOrder).toEqual(['text', 'logo', 'headline', 'elements', 'background']);
  });

  it('a new project is already in order (nothing changes)', () => {
    const doc = project(output());
    expect(orderLayers(doc)).toBe(doc);
  });

  it('rows out of their group go back to it; the order within a group is kept', () => {
    let doc = ok(addSource(project(output()), { id: 's2', kind: 'image', label: 'S2', behavesLike: 'subject' }));
    doc = withRows(doc, ['background', 'subject', 'logo', 's2', 'headline']);
    expect(rows(orderLayers(doc))).toEqual(['logo', 'headline', 'subject', 's2', 'background']);
    doc = withRows(doc, ['s2', 'logo', 'subject', 'headline', 'background']);
    expect(rows(orderLayers(doc))).toEqual(['logo', 'headline', 's2', 'subject', 'background']);
  });

  it('a Headline card sits in the headline group, under the logo', () => {
    const doc = ok(addLanguagePair(project(output()), { id: 'h', km: 'hk', en: 'he', board: { x: 0, y: 0 } }));
    // New inputs go to the front; ordered, the card's pictures land after the logo, with the text headline.
    expect(rows(orderLayers(doc))).toEqual(['logo', 'hk', 'he', 'headline', 'subject', 'background']);
  });

});

import { describe, expect, it } from 'vitest';
import { LIMITS, type ProjectDoc } from './model';
import { createProjectDoc } from './project';
import {
  addSource,
  ALLOWED_BEHAVIORS,
  defaultSources,
  deleteSource,
  duplicateSource,
  normalizePorts,
  renameSource,
  setSourceVisible,
  type SourceResult,
} from './sources';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.doc;
};
const ports = (doc: ProjectDoc) => Object.fromEntries(doc.sources.map((s) => [s.id, s.port]));
const contiguous = (doc: ProjectDoc) => doc.sources.map((s) => s.port).sort((a, b) => a - b).every((p, i) => p === i);

describe('default sources (D8)', () => {
  it('are Background, Subject, Headline, Logo with Logo in front and Background at the back', () => {
    const s = defaultSources();
    expect(s.map((x) => [x.label, x.kind, x.behavesLike, x.port])).toEqual([
      ['Background', 'fill', 'background', 3],
      ['Subject', 'image', 'subject', 2],
      ['Headline', 'text', 'text', 1],
      ['Logo', 'vector', 'logo', 0],
    ]);
    expect(s.every((x) => x.visible)).toBe(true);
    expect(s.map((x) => x.content.kind)).toEqual(['fill', 'image', 'text', 'vector']);
  });

  it('do not overlap on the board', () => {
    const ys = defaultSources().map((x) => x.board.y);
    for (let i = 1; i < ys.length; i++) expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(280);
  });
});

describe('addSource', () => {
  it('adds in front (port 0) with default content and shifts the others back', () => {
    const doc = ok(addSource(createProjectDoc('P'), { id: 'n1', kind: 'text', label: 'Small print', behavesLike: 'text' }));
    expect(ports(doc)).toEqual({ background: 4, subject: 3, headline: 2, logo: 1, n1: 0 });
    expect(doc.sources.find((s) => s.id === 'n1')?.content).toMatchObject({ kind: 'text', text: '' });
    expect(contiguous(doc)).toBe(true);
  });

  it('puts a new background at the back', () => {
    const doc = ok(addSource(createProjectDoc('P'), { id: 'bg2', kind: 'image', label: 'Photo', behavesLike: 'background' }));
    expect(ports(doc).bg2).toBe(4);
    expect(ports(doc).logo).toBe(0);
  });

  it('places the new node below the lowest input', () => {
    const doc0 = createProjectDoc('P');
    const doc = ok(addSource(doc0, { id: 'n', kind: 'fill', label: 'Band', behavesLike: 'decoration' }));
    const lowest = Math.max(...doc0.sources.map((s) => s.board.y));
    expect(doc.sources.find((s) => s.id === 'n')?.board.y).toBeGreaterThan(lowest);
  });

  it(`stops at ${LIMITS.maxSources} inputs, the 4 defaults included (D7)`, () => {
    let doc = createProjectDoc('P');
    for (let i = 0; i < LIMITS.maxSources - 4; i++) doc = ok(addSource(doc, { id: `x${i}`, kind: 'image', label: 'x', behavesLike: 'decoration' }));
    expect(doc.sources).toHaveLength(LIMITS.maxSources);
    expect(addSource(doc, { id: 'over', kind: 'image', label: 'x', behavesLike: 'decoration' })).toEqual({ ok: false, error: 'limit' });
    expect(duplicateSource(doc, 'logo', 'over')).toEqual({ ok: false, error: 'limit' });
    expect(contiguous(doc)).toBe(true);
  });

  it('rejects behaviours that do not fit the kind', () => {
    expect(addSource(createProjectDoc('P'), { id: 'n', kind: 'text', label: 't', behavesLike: 'logo' })).toEqual({ ok: false, error: 'bad_behavior' });
    expect(addSource(createProjectDoc('P'), { id: 'n', kind: 'fill', label: 'f', behavesLike: 'subject' })).toEqual({ ok: false, error: 'bad_behavior' });
    expect(ALLOWED_BEHAVIORS.text).toEqual(['text']);
  });

  it('falls back to the kind as label when the name is blank', () => {
    const doc = ok(addSource(createProjectDoc('P'), { id: 'n', kind: 'vector', label: '   ', behavesLike: 'decoration' }));
    expect(doc.sources.find((s) => s.id === 'n')?.label).toBe('vector');
  });
});

describe('rename / hide', () => {
  it('renames (trimmed) and ignores blank names', () => {
    const doc = ok(renameSource(createProjectDoc('P'), 'headline', '  Title  '));
    expect(doc.sources.find((s) => s.id === 'headline')?.label).toBe('Title');
    expect(ok(renameSource(doc, 'headline', ' ')).sources.find((s) => s.id === 'headline')?.label).toBe('Title');
    expect(renameSource(doc, 'nope', 'x')).toEqual({ ok: false, error: 'not_found' });
  });

  it('hides and shows', () => {
    const hidden = ok(setSourceVisible(createProjectDoc('P'), 'logo', false));
    expect(hidden.sources.find((s) => s.id === 'logo')?.visible).toBe(false);
    expect(ok(setSourceVisible(hidden, 'logo', true)).sources.find((s) => s.id === 'logo')?.visible).toBe(true);
  });
});

describe('duplicateSource', () => {
  it('copies content right in front of the original, as an independent copy', () => {
    const doc0 = createProjectDoc('P');
    const doc = ok(duplicateSource(doc0, 'headline', 'h2'));
    const copy = doc.sources.find((s) => s.id === 'h2');
    expect(copy).toMatchObject({ label: 'Headline copy', kind: 'text', behavesLike: 'text', port: 1 });
    expect(ports(doc)).toEqual({ background: 4, subject: 3, headline: 2, h2: 1, logo: 0 });
    // Deep copy: editing the copy's style must not touch the original.
    if (copy?.content.kind === 'text') copy.content.style.fontSizePx = 1;
    const orig = doc.sources.find((s) => s.id === 'headline');
    expect(orig?.content.kind === 'text' && orig.content.style.fontSizePx).toBe(160);
  });

  it('wires the copy of a wired source at the same spot, without the library link (T8.1)', () => {
    const frame = { x: 0.7, y: 0.05, w: 0.2, h: 0.1 };
    const base = createProjectDoc('P');
    const doc0: ProjectDoc = { ...base, wires: [{ id: 'in:logo', from: 'logo', to: 'main', port: 0 }], master: { ...base.master, placements: { logo: frame } } };
    doc0.sources = doc0.sources.map((s) => (s.id === 'logo' ? { ...s, libraryItemId: 'lib1' } : s));
    const doc = ok(duplicateSource(doc0, 'logo', 'logo2'));
    expect(doc.sources.find((s) => s.id === 'logo2')?.libraryItemId).toBeUndefined();
    // The copy takes port 0 (front); the original moves to 1 and its wire follows.
    expect(doc.wires.map((w) => [w.from, w.port]).sort()).toEqual([['logo', 1], ['logo2', 0]]);
    expect(doc.master.placements.logo2).toEqual(frame);
    expect(doc.master.placements.logo2).not.toBe(doc.master.placements.logo); // its own frame
  });

  it('leaves the copy of an unwired source unwired', () => {
    const doc = ok(duplicateSource(createProjectDoc('P'), 'logo', 'logo2'));
    expect(doc.wires).toEqual([]);
    expect(doc.master.placements.logo2).toBeUndefined();
  });
});

describe('deleteSource', () => {
  it('removes the source and every reference to it, closing the port gap', () => {
    const doc0: ProjectDoc = {
      ...createProjectDoc('P'),
      wires: [
        { id: 'w1', from: 'subject', to: 'main', port: 2 },
        { id: 'w2', from: 'logo', to: 'main', port: 0 },
      ],
      outputs: [
        {
          id: 'o',
          label: 'O',
          size: { width: 100, height: 100, unit: 'px' },
          family: 'auto',
          board: { x: 0, y: 0 },
          overrides: [
            { sourceId: 'subject', hidden: true, updatedBy: 'u', updatedAt: '2026-01-01' },
            { sourceId: 'logo', hidden: true, updatedBy: 'u', updatedAt: '2026-01-01' },
          ],
          frozen: { items: [{ sourceId: 'subject', frame: { x: 0, y: 0, w: 1, h: 1 } }] },
        },
      ],
    };
    doc0.master.placements = { subject: { x: 0, y: 0, w: 1, h: 1 }, logo: { x: 0, y: 0, w: 0.1, h: 0.1 } };
    const doc = ok(deleteSource(doc0, 'subject'));
    expect(doc.sources.map((s) => s.id)).toEqual(['background', 'headline', 'logo']);
    expect(ports(doc)).toEqual({ background: 2, headline: 1, logo: 0 });
    expect(doc.wires.map((w) => w.id)).toEqual(['w2']);
    expect(Object.keys(doc.master.placements)).toEqual(['logo']);
    expect(doc.outputs[0]?.overrides.map((o) => o.sourceId)).toEqual(['logo']);
    expect(doc.outputs[0]?.frozen?.items).toEqual([]);
    expect(deleteSource(doc, 'subject')).toEqual({ ok: false, error: 'not_found' });
  });

  it('can delete the defaults too', () => {
    let doc = createProjectDoc('P');
    for (const id of ['background', 'subject', 'headline', 'logo']) doc = ok(deleteSource(doc, id));
    expect(doc.sources).toEqual([]);
  });
});

describe('normalizePorts', () => {
  it('keeps the order and closes gaps', () => {
    const s = defaultSources().map((x) => ({ ...x, port: x.port * 3 }));
    expect(normalizePorts(s).map((x) => x.port)).toEqual([3, 2, 1, 0]);
  });
});

/** ADAPTATION-RULES worked example I: output-only layers (T12.4). */
import { describe, expect, it } from 'vitest';
import { compositionHealth, outputHealth } from '../health';
import type { InputSource, ProjectDoc } from '../model';
import { connectOutputLayer, disconnectOutputLayer, moveOutputLayer } from '../output-layers';
import { deleteSource } from '../sources';
import { computeLayout } from './index';
import { expectFrame, mockMeasure, output, project } from './test-doc';

const deps = { measure: mockMeasure, assets: { logoA: { width: 400, height: 200 }, picA: { width: 1000, height: 500 } } };

const extra = (id: string, behavesLike: InputSource['behavesLike']): InputSource =>
  behavesLike === 'text'
    ? { id, label: id, kind: 'text', behavesLike, visible: true, content: { kind: 'text', text: 'SALE', style: { fontFamily: 'Inter', fontWeight: 700, fontSizePx: 200, lineHeight: 1.2, color: '#000', align: 'center', maxLines: 2 } }, board: { x: 0, y: 0 } }
    : { id, label: id, kind: 'image', behavesLike, visible: true, content: { kind: 'image', assetId: behavesLike === 'logo' ? 'logoA' : 'picA', focal: { x: 0.5, y: 0.5 } }, board: { x: 0, y: 0 } };

function withOwn(...ids: [string, InputSource['behavesLike']][]): ProjectDoc {
  let doc: ProjectDoc = { ...project(), sources: [...project().sources, ...ids.map(([id, b]) => extra(id, b))] };
  for (const [id] of ids) {
    const r = connectOutputLayer(doc, 'o1', id);
    if (!r.ok) throw new Error(r.error);
    doc = r.doc;
  }
  return doc;
}
const item = (doc: ProjectDoc, id: string) => computeLayout(doc, 'o1', deps).items.find((i) => i.sourceId === id);

describe('output-only layers (example I)', () => {
  it('logo: top-right of S, 15% of its short side, asset aspect', () => {
    expectFrame(item(withOwn(['sticker', 'logo']), 'sticker')?.frame, { x: 880.2, y: 54, w: 145.8, h: 72.9 });
  });

  it('text: bottom band of S, fit from fontSizePx·k', () => {
    const t = item(withOwn(['legal', 'text']), 'legal');
    expectFrame(t?.frame, { x: 54, y: 985.5, w: 972, h: 310.5 });
    expect(t?.fontSizePx).toBe(72);
    expect(t?.lines).toEqual(['SALE']);
  });

  it('subject: contain-fit into 60% of S, centred', () => {
    expectFrame(item(withOwn(['promo', 'subject']), 'promo')?.frame, { x: 248.4, y: 529.2, w: 583.2, h: 291.6 });
  });

  it('drawn above every composition layer, back to front in row order', () => {
    const doc = withOwn(['promo', 'subject'], ['sticker', 'logo']); // sticker connected last = front
    const ids = computeLayout(doc, 'o1', deps).items.map((i) => i.sourceId);
    expect(ids.slice(-2)).toEqual(['promo', 'sticker']);
    const moved = moveOutputLayer(doc, 'o1', 'promo', 0);
    if (!moved.ok) throw new Error();
    expect(computeLayout(moved.doc, 'o1', deps).items.map((i) => i.sourceId).slice(-2)).toEqual(['sticker', 'promo']);
  });

  it('overrides apply; hidden or unwired rows are skipped; the composition wins a shared layer', () => {
    let doc = withOwn(['sticker', 'logo']);
    doc = { ...doc, outputs: doc.outputs.map((o) => ({ ...o, overrides: [{ sourceId: 'sticker', frame: { x: 10 }, updatedBy: 'u', updatedAt: '' }] })) };
    expect(item(doc, 'sticker')?.frame.x).toBe(10);
    expect(item(doc, 'sticker')?.overridden).toBe(true);
    const off = disconnectOutputLayer(doc, 'o1', 'sticker');
    if (!off.ok) throw new Error();
    expect(item(off.doc, 'sticker')).toBeUndefined();
    expect(off.doc.outputs[0]?.layers).toBeUndefined();
    const shared = connectOutputLayer(project(), 'o1', 'logo'); // logo is already a master preview layer
    if (!shared.ok) throw new Error();
    expect(computeLayout(shared.doc, 'o1', deps).items.filter((i) => i.sourceId === 'logo')).toHaveLength(1);
  });

  it('only that output gets it; deleting the input removes the row; empty ones show in health', () => {
    let doc = withOwn(['sticker', 'logo']);
    doc = { ...doc, outputs: [...doc.outputs, output({ id: 'o2' })] };
    expect(computeLayout(doc, 'o2', deps).items.some((i) => i.sourceId === 'sticker')).toBe(false);
    const blank: ProjectDoc = { ...doc, sources: doc.sources.map((s) => (s.id === 'sticker' && s.content.kind === 'image' ? { ...s, content: { ...s.content, assetId: null } } : s)) };
    const layout = computeLayout(blank, 'o1', deps);
    expect(outputHealth(blank, 'o1', layout).issues.some((i) => i.sourceId === 'sticker' && i.code === 'empty')).toBe(true);
    expect(compositionHealth(blank).issues.some((i) => i.sourceId === 'sticker')).toBe(false);
    const gone = deleteSource(doc, 'sticker');
    if (!gone.ok) throw new Error();
    expect(gone.doc.outputs[0]?.layers).toEqual([]);
    expect(gone.doc.edges.some((e) => e.from === 'sticker')).toBe(false);
  });
});

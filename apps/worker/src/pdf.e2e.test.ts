/** T6.3: vector PDF, page size in mm incl. bleed, crop marks (default on with bleed) in a slug margin. */
import { addOutput, connectSource, createProjectDoc, type ProjectDoc } from '@smart-canvas/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportPdf, SLUG_MM } from './pdf';
import { openRender } from './render';
import { fakeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

function sampleDoc(): ProjectDoc {
  let doc = createProjectDoc('PDF');
  for (const id of ['background', 'headline']) doc = ok(connectSource(doc, id));
  doc = {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'background'
        ? { ...s, content: { kind: 'fill', fill: { type: 'solid', color: '#00aa55' } } }
        : s.id === 'headline' && s.content.kind === 'text'
          ? { ...s, content: { ...s.content, text: 'Vector headline' } }
          : s,
    ),
  };
  doc = ok(addOutput(doc, { id: 'a5', label: 'A5', size: { width: 148, height: 210, unit: 'mm' }, dpi: 300, bleedMm: 3 }));
  doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1080, unit: 'px' } }));
  return doc;
}

const MM_TO_PT = 72 / 25.4;
/** Chromium snaps PDF paper sizes slightly up (≈0.2 mm); allow 1 pt (0.35 mm). */
const nearPt = (actual: number, mm: number) => expect(Math.abs(actual - mm * MM_TO_PT)).toBeLessThan(1);
/** [w, h] in pt from the first /MediaBox. */
function mediaBox(pdf: Buffer): [number, number] {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
  if (!m) throw new Error('no MediaBox');
  return [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])];
}
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe('PDF export (T6.3)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  const doc = sampleDoc();
  const api = fakeApi(doc);
  beforeAll(async () => {
    env = await startRenderEnv();
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  async function pdf(target: string, opts: Parameters<typeof exportPdf>[1]) {
    const page = await openRender(env.browser, env.webUrl, { teamId: TEAM, projectId: PROJECT, target, scale: 1 }, api.fetch);
    try {
      return await exportPdf(page, opts);
    } finally {
      await page.close();
    }
  }

  it('one page, sized in mm incl. bleed, with live (vector) text', async () => {
    const r = await pdf('a5', { bleedMm: 3, cropMarks: false });
    expect(r.mime).toBe('application/pdf');
    expect(r.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(r.bytes)).toBe(1);
    expect(r.widthMm).toBeCloseTo(154, 1);
    expect(r.heightMm).toBeCloseTo(216, 1);
    const [w, h] = mediaBox(r.bytes);
    nearPt(w, 154);
    nearPt(h, 216);
    expect(r.bytes.toString('latin1')).toMatch(/\/FontFile2|\/FontFile3|\/Font/); // embedded font = text, not pixels
  }, 60_000);

  it('crop marks default on with bleed, in a slug margin around the bleed box', async () => {
    const r = await pdf('a5', { bleedMm: 3 });
    expect(r.widthMm).toBeCloseTo(154 + 2 * SLUG_MM, 1);
    expect(r.heightMm).toBeCloseTo(216 + 2 * SLUG_MM, 1);
    const [w] = mediaBox(r.bytes);
    nearPt(w, 154 + 2 * SLUG_MM);
  }, 60_000);

  it('no bleed → no marks by default; px outputs print at 96 per inch', async () => {
    const r = await pdf('post', { bleedMm: 0 });
    expect(r.widthMm).toBeCloseTo((1080 / 96) * 25.4, 1);
  }, 60_000);
});

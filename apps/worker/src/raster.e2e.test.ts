/** T6.2: PNG / JPG / WebP at exactly exportPixels; PNG and WebP keep transparency; JPG is flat. */
import { addOutput, connectSource, createProjectDoc, exportPixels, setPlacement, type OutputNode, type ProjectDoc } from '@smart-canvas/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportRaster, type RasterFormat } from './raster';
import { openRender } from './render';
import { fakeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

const BLUE = '33333333-3333-4333-8333-333333333333';

async function bluePng(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
}

/** Background not wired (transparent canvas); a blue subject in the middle. */
function sampleDoc(): ProjectDoc {
  let doc = createProjectDoc('Raster');
  doc = ok(connectSource(doc, 'subject'));
  doc = ok(setPlacement(doc, 'subject', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }));
  doc = { ...doc, sources: doc.sources.map((s) => (s.id === 'subject' ? { ...s, content: { kind: 'image', assetId: BLUE, focal: { x: 0.5, y: 0.5 } } } : s)) };
  doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 300, height: 300, unit: 'px' }, exportScale: 2 }));
  doc = ok(addOutput(doc, { id: 'a6', label: 'A6', size: { width: 105, height: 148, unit: 'mm' }, dpi: 300, bleedMm: 3 }));
  return doc;
}

async function pixel(bytes: Buffer, x: number, y: number) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

describe('raster export (T6.2)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  let api: ReturnType<typeof fakeApi>;
  const doc = sampleDoc();
  const output = (id: string) => doc.outputs.find((o) => o.id === id) as OutputNode;

  beforeAll(async () => {
    env = await startRenderEnv();
    api = fakeApi(doc, [{ id: BLUE, width: 100, height: 100, mime: 'image/png', body: await bluePng() }]);
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  async function shoot(target: string, format: RasterFormat, bleed = true) {
    const page = await openRender(env.browser, env.webUrl, { teamId: TEAM, projectId: PROJECT, target, bleed }, api.fetch);
    try {
      return await exportRaster(page, format, { quality: 85 });
    } finally {
      await page.close();
    }
  }

  it('PNG: exact pixel size, transparent where nothing is drawn, opaque content', async () => {
    const r = await shoot('post', 'png');
    expect(r).toMatchObject({ mime: 'image/png', width: 600, height: 600 });
    expect((await sharp(r.bytes).metadata()).hasAlpha).toBe(true);
    expect((await pixel(r.bytes, 2, 2)).a).toBe(0);
    expect(await pixel(r.bytes, 300, 300)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  }, 60_000);

  it('JPG: exact size, flattened on white', async () => {
    const r = await shoot('post', 'jpg');
    expect(r).toMatchObject({ mime: 'image/jpeg', width: 600, height: 600 });
    expect((await sharp(r.bytes).metadata()).format).toBe('jpeg');
    const corner = await pixel(r.bytes, 2, 2);
    expect(Math.min(corner.r ?? 0, corner.g ?? 0, corner.b ?? 0)).toBeGreaterThan(245);
  }, 60_000);

  it('WebP: exact size via sharp, keeps transparency', async () => {
    const r = await shoot('post', 'webp');
    expect(r).toMatchObject({ mime: 'image/webp', width: 600, height: 600 });
    expect((await sharp(r.bytes).metadata()).format).toBe('webp');
    expect((await pixel(r.bytes, 2, 2)).a).toBe(0);
  }, 60_000);

  it('print output: exportPixels with and without bleed (A6, 300 dpi, 3 mm)', async () => {
    const withBleed = await shoot('a6', 'png');
    expect({ w: withBleed.width, h: withBleed.height }).toEqual(exportPixels(output('a6'), true));
    const trim = await shoot('a6', 'png', false);
    expect({ w: trim.width, h: trim.height }).toEqual(exportPixels(output('a6'), false));
  }, 90_000);
});

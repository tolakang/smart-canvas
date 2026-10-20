/** T6.4: SVG with live text (default) or outlined text, self-contained, drawn like the PNG. */
import { addOutput, connectSource, createProjectDoc, setPlacement, type ProjectDoc } from '@smart-canvas/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportRaster } from './raster';
import { openRender } from './render';
import { exportSvg } from './svg';
import { fakeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

const BLUE = '33333333-3333-4333-8333-333333333333';

function sampleDoc(headlineRotation = 0): ProjectDoc {
  let doc = createProjectDoc('SVG');
  for (const id of ['background', 'subject', 'headline']) doc = ok(connectSource(doc, id));
  doc = ok(setPlacement(doc, 'subject', { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }));
  if (headlineRotation) doc = ok(setPlacement(doc, 'headline', { x: 0.08, y: 0.55, w: 0.84, h: 0.3, rotation: headlineRotation }));
  doc = {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'background'
        ? { ...s, content: { kind: 'fill', fill: { type: 'solid', color: '#ffcc00' } } }
        : s.id === 'subject'
          ? { ...s, content: { kind: 'image', assetId: BLUE, focal: { x: 0.5, y: 0.5 } } }
          : s.id === 'headline' && s.content.kind === 'text'
            ? { ...s, content: { ...s.content, text: 'Live text សួស្តី' } }
            : s,
    ),
  };
  return ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 400, height: 400, unit: 'px' } }));
}

/** Draws an SVG on its own (as an <img>, like any viewer) and returns the pixels. */
async function drawSvg(browser: Awaited<ReturnType<typeof startRenderEnv>>['browser'], bytes: Buffer, size: number) {
  const viewer = await browser.newPage({ viewport: { width: size, height: size } });
  await viewer.setContent(`<body style="margin:0"><img id="i" src="data:image/svg+xml;base64,${bytes.toString('base64')}"></body>`);
  await viewer.locator('#i').evaluate((img: HTMLImageElement) => img.decode());
  await viewer.waitForTimeout(200);
  const shot = await viewer.locator('#i').screenshot();
  await viewer.close();
  return sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Dark (text) pixels of `a` with no dark-ish pixel of `b` within 1 px. */
function farDark(a: { data: Buffer; info: sharp.OutputInfo }, b: { data: Buffer; info: sharp.OutputInfo }): number {
  const { width: w, height: h, channels: ca } = a.info;
  const cb = b.info.channels;
  const lum = (d: Buffer, ch: number, i: number) => 0.299 * (d[i * ch] ?? 0) + 0.587 * (d[i * ch + 1] ?? 0) + 0.114 * (d[i * ch + 2] ?? 0);
  let far = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (lum(a.data, ca, y * w + x) > 60) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = lum(b.data, cb, (y + dy) * w + x + dx) < 160;
      if (!near) far++;
    }
  return far;
}

describe('SVG export (T6.4)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  let api: ReturnType<typeof fakeApi>;
  let rotated: ReturnType<typeof fakeApi>;
  beforeAll(async () => {
    env = await startRenderEnv();
    const blue = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
    const assets = [{ id: BLUE, width: 50, height: 50, mime: 'image/png', body: blue }];
    api = fakeApi(sampleDoc(), assets);
    rotated = fakeApi(sampleDoc(8), assets);
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  it('is well-formed SVG with real text, embedded fonts and images, and draws like the PNG', async () => {
    const page = await openRender(env.browser, env.webUrl, { teamId: TEAM, projectId: PROJECT, target: 'post' }, api.fetch);
    const svg = await exportSvg(page);
    const png = await exportRaster(page, 'png');
    await page.close();
    const text = svg.bytes.toString('utf8');
    expect(svg).toMatchObject({ mime: 'image/svg+xml', width: 400, height: 400 });
    expect(text).toContain('Live text សួស្តី'); // text stays text
    expect(text).toMatch(/@font-face/);
    expect(text).toMatch(/url\("data:font\/woff2;base64,/);
    expect(text).toMatch(/src="data:image\/png;base64,/);
    expect(text).not.toMatch(/\/api\//); // nothing points back at the app

    // Parse and draw the SVG on its own; compare with the PNG export.
    const viewer = await env.browser.newPage({ viewport: { width: 400, height: 400 } });
    const parsed = await viewer.evaluate((s) => new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror') === null, text);
    expect(parsed).toBe(true);
    await viewer.setContent(`<body style="margin:0"><img id="i" src="data:image/svg+xml;base64,${svg.bytes.toString('base64')}"></body>`);
    await viewer.locator('#i').evaluate((img: HTMLImageElement) => img.decode());
    await viewer.waitForTimeout(200);
    const shot = await viewer.locator('#i').screenshot();
    await viewer.close();
    const [a, b] = await Promise.all([sharp(shot).raw().toBuffer({ resolveWithObject: true }), sharp(png.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
    expect(a.info.width).toBe(400);
    const at = (buf: Buffer, ch: number, x: number, y: number) => [...buf.subarray((y * 400 + x) * ch, (y * 400 + x) * ch + 3)];
    expect(at(a.data, a.info.channels, 5, 5)).toEqual(at(b.data, b.info.channels, 5, 5)); // yellow fill
    expect(at(a.data, a.info.channels, 100, 100)).toEqual([0, 0, 255]); // embedded image
  }, 90_000);

  it('outlined text (D23): glyph paths in place, no text and no fonts, drawn within 1 px of the PNG', async () => {
    const page = await openRender(env.browser, env.webUrl, { teamId: TEAM, projectId: PROJECT, target: 'post' }, rotated.fetch);
    const svg = await exportSvg(page, { outlineText: true });
    const png = await exportRaster(page, 'png');
    await page.close();
    const text = svg.bytes.toString('utf8');
    expect(svg).toMatchObject({ width: 400, height: 400, outlined: 1, live: 0 });
    expect(text).not.toContain('Live text');
    expect(text).not.toContain('សួស្តី');
    expect(text).not.toMatch(/@font-face/);
    expect(text).toMatch(/<path [^>]*d="M/);
    expect(text).toMatch(/src="data:image\/png;base64,/); // images still embedded
    expect(text).not.toMatch(/\/api\//);

    const [drawn, ref] = await Promise.all([drawSvg(env.browser, svg.bytes, 400), sharp(png.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
    const dark = (d: typeof drawn) => { let n = 0; for (let i = 0; i < d.info.width * d.info.height; i++) if ((d.data[i * d.info.channels] ?? 255) < 60) n++; return n; };
    expect(dark(ref)).toBeGreaterThan(200); // the headline is there
    expect(farDark(drawn, ref), 'outline pixels > 1 px from the PNG text').toBe(0);
    expect(farDark(ref, drawn), 'PNG text pixels > 1 px from the outlines').toBe(0);
  }, 90_000);

  it('keeps a layer as live text when its font cannot be outlined', async () => {
    const page = await openRender(env.browser, env.webUrl, { teamId: TEAM, projectId: PROJECT, target: 'post' }, api.fetch);
    // No TTF/OTF/WOFF source can be read (only WOFF2, which has no decoder), as with a WOFF2 team upload.
    await page.route(/\.woff(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'font/woff', body: 'not a font' }));
    const svg = await exportSvg(page, { outlineText: true });
    await page.close();
    expect(svg).toMatchObject({ outlined: 0, live: 1 });
    expect(svg.bytes.toString('utf8')).toContain('Live text សួស្តី');
    expect(svg.bytes.toString('utf8')).toMatch(/@font-face/);
  }, 90_000);
});

/** T6.4: SVG with live text, self-contained (fonts + images embedded), drawn like the PNG. */
import { addOutput, connectSource, createProjectDoc, setPlacement, type ProjectDoc } from '@smart-canvas/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportRaster } from './raster';
import { openRender } from './render';
import { exportSvg } from './svg';
import { fakeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

const BLUE = '33333333-3333-4333-8333-333333333333';

function sampleDoc(): ProjectDoc {
  let doc = createProjectDoc('SVG');
  for (const id of ['background', 'subject', 'headline']) doc = ok(connectSource(doc, id));
  doc = ok(setPlacement(doc, 'subject', { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }));
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

describe('SVG export (T6.4, live text)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  let api: ReturnType<typeof fakeApi>;
  beforeAll(async () => {
    env = await startRenderEnv();
    const blue = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
    api = fakeApi(sampleDoc(), [{ id: BLUE, width: 50, height: 50, mime: 'image/png', body: blue }]);
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
});

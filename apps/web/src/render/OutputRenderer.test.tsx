import { createProjectDoc, DEFAULT_TEXT_STYLE, type InputSource, type RenderScene } from '@smart-canvas/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OutputRenderer, RenderThumbnail } from './OutputRenderer';

const defaults = createProjectDoc('P').sources;
const src = (id: string, patch: Partial<InputSource> = {}) => ({ ...(defaults.find((s) => s.id === id) as InputSource), ...patch });
const assetUrl = (id: string) => `/a/${id}`;

function html(scene: RenderScene, sources: InputSource[], scale = 1, mode: 'preview' | 'export' = 'export') {
  return renderToStaticMarkup(<OutputRenderer scene={scene} sources={sources} assetUrl={assetUrl} scale={scale} mode={mode} />);
}
const order = (markup: string) => [...markup.matchAll(/data-source-id="([^"]+)"/g)].map((m) => m[1]);

describe('OutputRenderer', () => {
  const sources = [
    src('background', { content: { kind: 'fill', fill: { type: 'solid', color: '#ff0000' } } }),
    src('subject', { content: { kind: 'image', assetId: 'img1', focal: { x: 0.25, y: 0.75 } } }),
    src('logo', { content: { kind: 'vector', assetId: null, focal: { x: 0.5, y: 0.5 } } }),
  ];
  const scene: RenderScene = {
    width: 1000,
    height: 500,
    items: [
      { sourceId: 'background', frame: { x: 0, y: 0, w: 1000, h: 500 } },
      { sourceId: 'subject', frame: { x: 100, y: 50, w: 300, h: 200, rotation: 10 } },
      { sourceId: 'logo', frame: { x: 800, y: 400, w: 100, h: 50 } },
    ],
  };

  it('scales the whole design-px canvas and keeps items in back→front order', () => {
    const out = html(scene, sources, 0.5);
    expect(out).toContain('width:500px;height:250px'); // output size = design × scale
    expect(out).toContain('width:1000px;height:500px;transform:scale(0.5)');
    expect(order(out)).toEqual(['background', 'subject']); // logo has no file: nothing in export mode
  });

  it('draws fills, images at their frame with rotation and focal point, and placeholders only in preview', () => {
    const out = html(scene, sources);
    expect(out).toContain('background:#ff0000');
    expect(out).toMatch(/src="\/a\/img1"[^>]*left:100px;top:50px;width:300px;height:200px;transform:rotate\(10deg\)/);
    expect(out).toContain('object-fit:contain;object-position:25% 75%');
    expect(html(scene, sources, 1, 'preview')).toContain('sc-render__placeholder');
  });

  it('covers for backgrounds, contains otherwise', () => {
    const bg = src('subject', { id: 'photo', behavesLike: 'background', content: { kind: 'image', assetId: 'p', focal: { x: 0.5, y: 0.5 } } });
    expect(html({ width: 10, height: 10, items: [{ sourceId: 'photo', frame: { x: 0, y: 0, w: 10, h: 10 } }] }, [bg])).toContain(
      'object-fit:cover',
    );
  });

  it('renders text with its font stack, size, Khmer line height and word-boundary breaks', () => {
    const head = src('headline', {
      content: { kind: 'text', text: 'សួស្តីកម្ពុជា', style: { ...DEFAULT_TEXT_STYLE, fontFamily: 'Kantumruy Pro' } },
    });
    const out = html({ width: 100, height: 100, items: [{ sourceId: 'headline', frame: { x: 0, y: 0, w: 100, h: 50 } }] }, [head]);
    expect(out).toContain('lang="km"');
    expect(out).toContain('font-family:&quot;Kantumruy Pro&quot;, &quot;Noto Sans Khmer&quot;, &quot;Noto Sans&quot;, sans-serif');
    expect(out).toContain('font-size:160px;line-height:1.6');
    expect(out).toContain('​'); // word boundary marker
  });

  it('uses engine lines verbatim and the engine font size when given', () => {
    const head = src('headline', { content: { kind: 'text', text: 'ignored when lines exist', style: DEFAULT_TEXT_STYLE } });
    const out = html(
      { width: 100, height: 100, items: [{ sourceId: 'headline', frame: { x: 0, y: 0, w: 100, h: 50 }, fontSizePx: 72, lines: ['AAAAA BBBBB', 'CCCCC'] }] },
      [head],
    );
    expect(out).toContain('font-size:72px;line-height:1.2');
    expect(out).toContain('white-space:pre');
    expect(out).toContain('<div>AAAAA BBBBB</div><div>CCCCC</div>');
    expect(out).not.toContain('ignored');
  });

  it('thumbnail fits the box keeping aspect', () => {
    const out = renderToStaticMarkup(<RenderThumbnail scene={scene} sources={sources} assetUrl={assetUrl} maxWidth={200} maxHeight={200} />);
    expect(out).toContain('width:200px;height:100px');
    expect(out).toContain('sc-render__placeholder');
  });
});

describe('OutputRenderer: fitted pictures (D37)', () => {
  it('a fitted frame is the visible part of the picture, which fills it (stretched with it)', () => {
    const layer = src('subject', { content: { kind: 'image', assetId: 'img1', focal: { x: 0.5, y: 0.5 } } });
    const scene: RenderScene = { width: 400, height: 200, items: [{ sourceId: 'subject', frame: { x: 0, y: 0, w: 300, h: 100, fitted: true } }] };
    // Visible part: the middle half across, the top two-thirds down, of a 400×300 picture → 300×100: ×1.5 across, ×0.5 down.
    const sizes = { img1: { width: 400, height: 300, trim: { x: 0.25, y: 0, w: 0.5, h: 2 / 3 } } };
    const out = renderToStaticMarkup(<OutputRenderer scene={scene} sources={[layer]} assetSizes={sizes} assetUrl={assetUrl} scale={1} />);
    expect(out).toContain('overflow:hidden');
    expect(out).toContain('left:-150px;top:0;width:600px;height:150px;max-width:none;object-fit:fill');
  });
});

describe('OutputRenderer: rotation and shear (transform box)', () => {
  it('draws rotate then skewX about the centre; neither when both are 0', () => {
    const fill = src('background', { content: { kind: 'fill', fill: { type: 'solid', color: '#ff0000' } } });
    const draw = (frame: RenderScene['items'][number]['frame']) =>
      renderToStaticMarkup(<OutputRenderer scene={{ width: 100, height: 100, items: [{ sourceId: 'background', frame }] }} sources={[fill]} assetUrl={assetUrl} scale={1} />);
    expect(draw({ x: 0, y: 0, w: 50, h: 50, rotation: 30, shear: -12 })).toContain('transform:rotate(30deg) skewX(-12deg);transform-origin:50% 50%');
    expect(draw({ x: 0, y: 0, w: 50, h: 50, shear: 20 })).toContain('transform:skewX(20deg)');
    expect(draw({ x: 0, y: 0, w: 50, h: 50 })).not.toMatch(/height:50px;[^"]*transform:/);
  });
});

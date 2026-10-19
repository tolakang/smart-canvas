import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dimensions } from './dimensions';
import { sniff } from './sniff';
import { sanitizeCss, sanitizeSvg, SvgRejected } from './svg-sanitize';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const svgBytes = (s: string) => new TextEncoder().encode(s);

describe('sniff (magic bytes)', () => {
  it.each([
    ['tiny.png', 'image/png'],
    ['tiny.jpg', 'image/jpeg'],
    ['tiny-lossy.webp', 'image/webp'],
    ['tiny-lossless.webp', 'image/webp'],
  ])('%s → %s', (file, mime) => {
    expect(sniff(fixture(file))?.mime).toBe(mime);
  });

  it('detects SVG behind a BOM, XML declaration, comments and a plain DOCTYPE', () => {
    const svg =
      '\uFEFF<?xml version="1.0"?>\n<!-- Generator: x -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect(sniff(svgBytes(svg))?.mime).toBe('image/svg+xml');
  });

  it('rejects other formats whatever they claim to be', () => {
    expect(sniff(fixture('tiny.gif'))).toBeNull();
    expect(sniff(svgBytes('<html><svg></svg></html>'))).toBeNull();
    expect(sniff(svgBytes('%PDF-1.7'))).toBeNull();
    expect(sniff(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('dimensions', () => {
  it.each([
    ['tiny.png', 3, 2],
    ['tiny.jpg', 5, 4],
    ['tiny-lossy.webp', 7, 6],
    ['tiny-lossless.webp', 9, 8],
  ])('%s is %ix%i', (file, width, height) => {
    expect(dimensions(fixture(file))).toEqual({ width, height });
  });

  it('reads SVG width/height or viewBox, null when unknown', () => {
    expect(dimensions(svgBytes('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>'))).toEqual({
      width: 120,
      height: 80,
    });
    expect(dimensions(svgBytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"/>'))).toEqual({
      width: 300,
      height: 150,
    });
    expect(dimensions(svgBytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

const wrap = (body: string, rootAttrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${rootAttrs}>${body}</svg>`;

describe('sanitizeSvg', () => {
  it('keeps ordinary artwork', () => {
    const out = sanitizeSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
          '<path d="M0 0L10 10" fill="url(#g)" style="stroke:#000"/><text x="1" xml:space="preserve">ស្វាគមន៍ &amp; hi</text>',
        ' width="10" height="10" viewBox="0 0 10 10"',
      ),
    );
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"></stop></linearGradient></defs>' +
        '<path d="M0 0L10 10" fill="url(#g)" style="stroke:#000"></path>' +
        '<text x="1" xml:space="preserve">ស្វាគមន៍ &amp; hi</text></svg>',
    );
  });

  it('removes scripts, event handlers and foreign content', () => {
    const out = sanitizeSvg(
      wrap(
        '<script>alert(1)</script><g onload="alert(1)" ONCLICK="x"><rect width="1" height="1"/></g>' +
          '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(2)</script></div></foreignObject>' +
          '<a href="https://evil.example"><circle r="1"/></a>' +
          '<animate attributeName="href" to="javascript:alert(3)"/><set attributeName="onclick" to="alert(4)"/>',
      ),
    );
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="1" height="1"></rect></g></svg>',
    );
    expect(out).not.toMatch(/script|alert|evil|foreign|animate|onload/i);
  });

  it('allows only in-document links and embedded rasters', () => {
    const out = sanitizeSvg(
      wrap(
        '<use xlink:href="#a"/><use href="https://evil.example/s.svg#a"/>' +
          '<image href="data:image/png;base64,iVBORw0KGgo="/><image href="https://evil.example/x.png"/>' +
          '<image xlink:href="data:image/svg+xml;base64,PHN2Zz4="/><use href="data:image/png;base64,AA=="/>' +
          '<rect fill="url(https://evil.example/p)" filter="url(&quot;#f&quot;)"/>',
      ),
    );
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"></use><use></use>' +
        '<image href="data:image/png;base64,iVBORw0KGgo="></image><image></image><image></image><use></use>' +
        '<rect fill="none" filter="url(&quot;#f&quot;)"></rect></svg>',
    );
  });

  it('strips external references from CSS', () => {
    expect(sanitizeCss("@import url('https://evil.example/a.css'); .a{fill:url(#g);background:url(http://x/y)}")).toBe(
      ' .a{fill:url(#g);background:none}',
    );
    expect(sanitizeCss('.a{background:u\\72l(http://x)}')).toBeNull();
    const out = sanitizeSvg(wrap('<style><![CDATA[@import "http://x/a.css"; .b > .c { fill: url(http://x) }]]></style>'));
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg"><style> .b &gt; .c { fill: none }</style></svg>');
  });

  it('drops javascript: anywhere in attribute values', () => {
    expect(sanitizeSvg(wrap('<rect class="a" data-x="JavaScript:alert(1)"/>'))).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="a"></rect></svg>',
    );
  });

  it('rejects entities, non-SVG roots and malformed XML', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg">&b;</svg>';
    expect(() => sanitizeSvg(bomb)).toThrow(SvgRejected);
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><text>&ext;</text></svg>')).toThrow(SvgRejected);
    expect(() => sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><svg/></html>')).toThrow(SvgRejected);
    expect(() => sanitizeSvg('<svg>no namespace</svg>')).toThrow(SvgRejected);
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow(SvgRejected);
  });
});

/**
 * SVG sanitizer (CLAUDE.md: no scripts, no external refs).
 * Parses with a strict XML parser and re-serializes only allowlisted elements and attributes, so
 * nothing from the input reaches the output unparsed. DOCTYPE internal subsets (entities) are rejected.
 * - Elements outside the allowlist are dropped with their subtree (script, foreignObject, a, animate, set, …).
 * - on* attributes, foreign-namespace attributes and anything mentioning javascript:/vbscript: are dropped.
 * - href / xlink:href (written as href) may only point inside the document (#id); <image>/<feImage> may also
 *   embed data:image/png|jpeg|webp;base64.
 * - CSS (style attributes and <style>): @import removed, url(…) not starting with # becomes `none`;
 *   CSS containing backslash escapes is dropped entirely (they can hide url()/@import).
 */
import { SaxesParser, type SaxesTagNS } from 'saxes';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const ELEMENTS = new Set(
  (
    'svg g defs symbol use switch path rect circle ellipse line polyline polygon text tspan textPath title desc ' +
    'linearGradient radialGradient stop clipPath mask pattern image marker style filter ' +
    'feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap ' +
    'feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge ' +
    'feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'
  ).split(' '),
);
const RASTER_HREF = new Set(['image', 'feImage']);
const DATA_RASTER = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]*$/;
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const DANGEROUS_VALUE = /(?:java|vb)script\s*:/i;

export class SvgRejected extends Error {}

export function sanitizeCss(css: string): string | null {
  if (css.includes('\\')) return null;
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m: string, _q: string, target: string) =>
      target.trim().startsWith('#') ? m : 'none',
    );
}

function cleanHref(value: string, element: string): string | null {
  const v = value.trim();
  if (v.startsWith('#')) return v;
  if (RASTER_HREF.has(element) && DATA_RASTER.test(v)) return v;
  return null;
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

export function sanitizeSvg(input: string): string {
  const parser = new SaxesParser({ xmlns: true });
  const out: string[] = [];
  const open: { name: string; kept: boolean }[] = [];
  let skipDepth = 0; // > 0 while inside a dropped subtree
  let sawRoot = false;
  let styleText: string[] | null = null;

  parser.on('doctype', (dt) => {
    if (dt.includes('[')) throw new SvgRejected('DOCTYPE internal subset not allowed');
  });

  parser.on('opentag', (tag: SaxesTagNS) => {
    if (!sawRoot) {
      if (tag.local !== 'svg' || tag.uri !== SVG_NS) throw new SvgRejected('root element is not <svg>');
      sawRoot = true;
    }
    const keep = skipDepth === 0 && tag.uri === SVG_NS && ELEMENTS.has(tag.local);
    if (!keep) {
      skipDepth++;
      open.push({ name: tag.local, kept: false });
      return;
    }
    const attrs: string[] = [];
    if (open.length === 0) attrs.push(`xmlns="${SVG_NS}"`);
    for (const a of Object.values(tag.attributes)) {
      const value = a.value;
      if (a.uri === XMLNS_NS || a.name === 'xmlns') continue; // namespaces are re-declared by us
      if (DANGEROUS_VALUE.test(value)) continue;
      let name: string;
      if (a.uri === XLINK_NS && a.local === 'href') name = 'href';
      else if (a.uri === XML_NS && (a.local === 'space' || a.local === 'lang')) name = `xml:${a.local}`;
      else if (a.uri === '' && ATTR_NAME.test(a.name) && !/^on/i.test(a.name)) name = a.name;
      else continue;

      let clean: string | null = value;
      if (name === 'href') clean = cleanHref(value, tag.local);
      else if (name === 'style') clean = sanitizeCss(value);
      else if (/url\(/i.test(value)) clean = sanitizeCss(value);
      if (clean === null) continue;
      attrs.push(`${name}="${escAttr(clean)}"`);
    }
    out.push(`<${tag.local}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
    open.push({ name: tag.local, kept: true });
    if (tag.local === 'style') styleText = [];
  });

  const onText = (text: string) => {
    if (skipDepth > 0) return;
    if (styleText) styleText.push(text);
    else if (open.length > 0) out.push(escText(text));
  };
  parser.on('text', onText);
  parser.on('cdata', onText);

  parser.on('closetag', () => {
    const el = open.pop();
    if (!el) return;
    if (!el.kept) {
      skipDepth--;
      return;
    }
    if (el.name === 'style' && styleText) {
      const css = sanitizeCss(styleText.join(''));
      if (css) out.push(escText(css));
      styleText = null;
    }
    out.push(`</${el.name}>`);
  });

  try {
    parser.write(input).close();
  } catch (err) {
    if (err instanceof SvgRejected) throw err;
    throw new SvgRejected(`invalid XML: ${(err as Error).message.split('\n')[0]}`);
  }
  if (!sawRoot) throw new SvgRejected('no <svg> element');
  return out.join('');
}

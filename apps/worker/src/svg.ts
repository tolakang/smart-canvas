/**
 * SVG export (T6.4): the ready render page's own DOM, wrapped in an SVG <foreignObject>, so the SVG is
 * drawn by the same OutputRenderer as preview and export (no second rendering path). Text stays text by
 * default; with `outlineText` (D23) each text layer becomes glyph paths in place (svg-outline.ts).
 * It is self-contained: images become data: URIs and the @font-face rules of the families still drawn as
 * live text are embedded with their font files.
 */
import type { Page } from 'playwright';
import { FRAME, RenderError } from './render';
import { outlineTextLayers } from './svg-outline';

export interface SvgResult {
  bytes: Buffer;
  mime: 'image/svg+xml';
  width: number;
  height: number;
  /** Text layers drawn as outlines / kept as live text (fonts it could not outline). */
  outlined: number;
  live: number;
}

export async function exportSvg(page: Page, opts: { outlineText?: boolean } = {}): Promise<SvgResult> {
  const outlines = opts.outlineText ? await outlineTextLayers(page) : [];
  const out = await page.locator(FRAME).first().evaluate(async (frame, outlines) => {
    const toDataUrl = async (url: string) => {
      const blob = await (await fetch(url)).blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(blob);
      });
    };
    const width = Number(frame.dataset.exactWidth);
    const height = Number(frame.dataset.exactHeight);
    const clone = frame.cloneNode(true) as HTMLElement;
    clone.removeAttribute('class');
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    for (const img of clone.querySelectorAll('img')) img.setAttribute('src', await toDataUrl(img.src));

    // Outlined layers: their lines become the paths (same box, so order and rotation are kept).
    const cloneTexts = [...clone.querySelectorAll<HTMLElement>('[data-kind="text"]')];
    outlines.forEach((markup, i) => {
      const el = cloneTexts[i];
      if (el && markup) el.innerHTML = markup;
    });

    // Families used by the text still drawn live (first family of each font stack, plus the bundled fallbacks).
    const used = new Set<string>();
    [...frame.querySelectorAll<HTMLElement>('[data-kind="text"]')].forEach((el, i) => {
      if (outlines[i]) return;
      for (const f of getComputedStyle(el).fontFamily.split(',')) used.add(f.trim().replace(/^["']|["']$/g, ''));
    });
    const faces: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '');
        if (!used.has(family)) continue;
        let css = rule.cssText;
        for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          const src = m[1];
          if (!src || src.startsWith('data:')) continue;
          css = css.replace(m[0], `url("${await toDataUrl(new URL(src, sheet.href ?? document.baseURI).href)}")`);
        }
        faces.push(css);
      }
    }
    const xhtml = new XMLSerializer().serializeToString(clone);
    const style = faces.join('\n').replace(/]]>/g, ']]]]><![CDATA[>');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<style><![CDATA[\n${style}\n]]></style>` +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
    return { svg, width, height, texts: cloneTexts.length };
  }, outlines);
  if (!out.width || !out.height) throw new RenderError('render: nothing drawn');
  const outlined = outlines.filter(Boolean).length;
  return { bytes: Buffer.from(out.svg, 'utf8'), mime: 'image/svg+xml', width: out.width, height: out.height, outlined, live: out.texts - outlined };
}

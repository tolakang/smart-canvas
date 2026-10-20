/**
 * SVG export (T6.4, live text): the ready render page's own DOM, wrapped in an SVG <foreignObject>, so
 * the SVG is drawn by the same OutputRenderer as preview and export (no second rendering path) and keeps
 * text as text. It is self-contained: images become data: URIs and the @font-face rules of the families
 * in use are embedded with their font files. Outlined text (D23) waits on spike S3 (O5).
 */
import type { Page } from 'playwright';
import { FRAME, RenderError } from './render';

export interface SvgResult {
  bytes: Buffer;
  mime: 'image/svg+xml';
  width: number;
  height: number;
}

export async function exportSvg(page: Page): Promise<SvgResult> {
  const out = await page.locator(FRAME).first().evaluate(async (frame) => {
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

    // Families used by the drawn text (first family of each font stack, plus the bundled fallbacks).
    const used = new Set<string>();
    for (const el of frame.querySelectorAll<HTMLElement>('[data-kind="text"]')) {
      for (const f of getComputedStyle(el).fontFamily.split(',')) used.add(f.trim().replace(/^["']|["']$/g, ''));
    }
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
    return { svg, width, height };
  });
  if (!out.width || !out.height) throw new RenderError('render: nothing drawn');
  return { bytes: Buffer.from(out.svg, 'utf8'), mime: 'image/svg+xml', width: out.width, height: out.height };
}

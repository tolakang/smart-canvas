/**
 * Export files made from a drawn render frame (D31): the same code in the user's browser and in the export
 * worker (which calls it on its render page through `window.scExport`), so both make the same file.
 * - frameToSvg: the frame's own DOM in an SVG <foreignObject> (T6.4), self-contained: images become data:
 *   URIs, and the @font-face rules of the families still drawn as live text are embedded with their files.
 *   `outlines` (worker only, D23) replaces text layers, in order, with glyph-path markup.
 * - svgToRaster (browser, T11.1): that SVG drawn on a canvas at the export pixel size.
 */

export interface SvgFile {
  svg: string;
  width: number;
  height: number;
  /** Text layers in the frame. */
  texts: number;
}

export async function frameToSvg(frame: HTMLElement, outlines: readonly (string | null)[] = []): Promise<SvgFile> {
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
  // Recolored pictures (T12.6) are CSS masks: their files go inline too.
  for (const el of clone.querySelectorAll<HTMLElement>('[data-mask-src]')) {
    const mask = `url("${await toDataUrl(new URL(el.dataset.maskSrc ?? '', document.baseURI).href)}")`;
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
    el.removeAttribute('data-mask-src');
  }

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
}

export type RasterType = 'png' | 'jpg' | 'webp';
const MIME: Record<RasterType, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** The SVG drawn on a `width`×`height` px canvas (the export size); JPG is flattened on white, like the worker. */
export async function svgToRaster(file: SvgFile, size: { width: number; height: number }, type: RasterType, quality = 90): Promise<Blob> {
  // A data: URL, not a blob: one: Chrome taints a canvas drawn from a blob: SVG with <foreignObject>.
  const img = new Image();
  img.decoding = 'sync';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.svg)}`;
  {
    await img.decode();
    await settled(img, file);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas');
    if (type === 'jpg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(img, 0, 0, file.width, file.height);
    if (type === 'jpg') return await jpegOf(ctx, size, quality);
    const q = Math.min(100, Math.max(1, Math.round(quality))) / 100;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, MIME[type], type === 'png' ? undefined : q));
    if (!blob || blob.type !== MIME[type]) throw new Error(`browser cannot encode ${type}`);
    return blob;
  }
}

/**
 * JPEG with full-resolution colour (4:4:4), like the worker's sharp encoder. The browser's own encoder
 * (canvas.toBlob) halves the colour resolution below quality 100, which smears red text and coloured edges.
 */
async function jpegOf(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, quality: number): Promise<Blob> {
  const { encode } = await import('jpeg-js'); // loaded on the first JPG export only
  const { data } = ctx.getImageData(0, 0, size.width, size.height);
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  // jpeg-js hands back its bytes through Node's Buffer.from once bundled; lend it a Uint8Array one for the call.
  const g = globalThis as { Buffer?: { from: (bytes: ArrayLike<number>) => Uint8Array } };
  const lent = !g.Buffer;
  if (lent) g.Buffer = { from: (bytes) => Uint8Array.from(bytes) };
  try {
    const bytes = new Uint8Array(encode({ data, width: size.width, height: size.height }, q).data);
    return new Blob([bytes], { type: 'image/jpeg' });
  } finally {
    if (lent) delete g.Buffer;
  }
}

/**
 * An SVG image's embedded fonts load after decode() resolves: drawn at once, its text uses a fallback
 * (Khmer came out unshaped). Wait until three small draws in a row (150 ms) are identical: the fonts are in.
 */
async function settled(img: HTMLImageElement, file: SvgFile, timeoutMs = 5000): Promise<void> {
  const w = 320;
  const h = Math.max(1, Math.round((w * file.height) / file.width));
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const snap = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
  const tick = () => new Promise<void>((r) => setTimeout(r, 50));
  const end = performance.now() + timeoutMs;
  let prev = snap();
  let stable = 0;
  while (stable < 3) {
    if (performance.now() > end) throw new Error('fonts in the SVG did not load');
    await tick();
    const next = snap();
    stable = same(prev, next) ? stable + 1 : 0;
    prev = next;
  }
}

/**
 * D31 feature check: canvas encoding and SVG <foreignObject> drawing without tainting the canvas. Safari
 * (and anything else that fails) exports on the server.
 */
export function browserExportSupported(): boolean {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !('toBlob' in HTMLCanvasElement.prototype)) return false;
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(ua);
  return !safari;
}

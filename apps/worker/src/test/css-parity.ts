/**
 * Tailwind conversion safety net (P28): draw the page as it is now twice — with the app's own stylesheets, then with
 * the built CSS of main (test/css-reference/styles.css) in their place — and compare every element's computed style
 * (pseudo-elements included) and the pixels. Both draws run in the same browser on the same DOM, so fonts and
 * machine differences cancel out; any difference is the CSS.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { probeWinners } from './css-winners';

const referencePath = fileURLToPath(new URL('./css-reference/styles.css', import.meta.url));
const areasPath = fileURLToPath(new URL('./css-reference/areas.json', import.meta.url));
/** The rules this branch converts (scripts/css-reference.mjs): the elements they style had no utility classes at main. */
const convertedSubjects = (): string[] => {
  try {
    return (JSON.parse(readFileSync(areasPath, 'utf8')) as { subjects: string[] }).subjects;
  } catch {
    return [];
  }
};
export const referenceCss = () => readFileSync(referencePath, 'utf8');

export interface CssParity {
  /** Elements and properties that differ, at most 40, as "path :: prop: reference → app". */
  styles: string[];
  /** Pixels that differ in the viewport screenshot by more than anti-aliasing noise (NOISE). */
  pixels: number;
}

/** Freeze what moves on its own: run transitions and one-off animations (a dialog's entrance) to their end, park endless ones (a spinner) at their start. */
const settle = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await frame();
    await frame();
    for (const a of document.getAnimations()) {
      if (Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity)) a.finish();
      else {
        a.pause();
        a.currentTime = 0;
      }
    }
    await frame();
  });

/** Every element's computed style in the page, keyed by its place in the DOM; custom properties are skipped (their effect shows in the real ones). */
const snapshot = (page: Page, key: string) =>
  page.evaluate((key) => {
    const out = new Map<string, string>();
    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
        const cls = [...e.classList].filter((c) => c.startsWith('sc-') || c.startsWith('react-flow__')).slice(0, 2);
        const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0;
        parts.unshift(`${e.tagName.toLowerCase()}${cls.map((c) => `.${c}`).join('')}[${i}]`);
      }
      return parts.join(' > ');
    };
    const record = (path: string, cs: CSSStyleDeclaration) => {
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        if (!prop.startsWith('--')) out.set(`${path} :: ${prop}`, cs.getPropertyValue(prop));
      }
    };
    for (const el of [document.documentElement, ...document.querySelectorAll('body, body *')]) {
      const path = pathOf(el) || 'html';
      record(path, getComputedStyle(el));
      for (const pseudo of ['::before', '::after', '::placeholder']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo === '::placeholder' ? el.matches('input, textarea') : cs.content !== 'none') record(`${path}${pseudo}`, cs);
      }
    }
    (window as unknown as Record<string, Map<string, string>>)[key] = out;
  }, key);

/**
 * The app's own stylesheets (Vite serves each CSS file as a <style data-vite-dev-id>), Tailwind's and React Flow's
 * (through board/reactflow.css) included; the bundled fonts are not ours. The elements this branch converted lose
 * their utility classes (the ones the app's Tailwind sheet defines) while the reference is drawn, as they were at main.
 */
/**
 * Elements an earlier step converted that a rule removed now also styled (T4a: the inspector's health pill took its tone
 * from pipeline.css). Their utilities were already on main, so they keep them while main's CSS is drawn.
 */
const CONVERTED_BEFORE = ['.sc-inspector-panel__level'];

const swapIn = (page: Page, css: string, subjects: string[]) =>
  page.evaluate(({ css, subjects, before }) => {
    const ours = [...document.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id]')].filter((s) => {
      const id = s.dataset.viteDevId ?? '';
      return id.includes('/apps/web/src/') && !id.includes('/apps/web/src/fonts/');
    });
    if (!ours.length) throw new Error('no app stylesheets found');
    const utilities = ours.find((s) => (s.dataset.viteDevId ?? '').endsWith('/apps/web/src/tailwind.css'))?.textContent ?? '';
    // A whole class name in the sheet (`.bottom-0` is not `.bottom`, React Flow's). Our own hooks (`sc-…`) are never
    // utilities, though a utility's selector can name one (`[.sc-canvasbar>…_&]:`).
    const isUtility = (c: string) => {
      const name = `.${CSS.escape(c)}`;
      for (let i = utilities.indexOf(name); i >= 0; i = utilities.indexOf(name, i + 1)) if (!/[\w-]/.test(utilities[i + name.length] ?? '')) return !c.startsWith('sc-');
      return false;
    };
    const stripped: [Element, string][] = [];
    for (const sel of subjects) {
      const els = (() => {
        try {
          return [...document.querySelectorAll(sel)];
        } catch {
          return []; // a selector only the stylesheet understands
        }
      })();
      for (const el of els) {
        if (stripped.some(([e]) => e === el) || before.some((b) => el.matches(b))) continue;
        const keep = [...el.classList].filter((c) => !isUtility(c));
        if (keep.length === el.classList.length) continue;
        stripped.push([el, el.getAttribute('class') ?? '']);
        el.setAttribute('class', keep.join(' '));
      }
    }
    (window as unknown as Record<string, [Element, string][]>).__scStripped = stripped;
    const ref = document.createElement('style');
    ref.id = 'sc-css-reference';
    ref.textContent = css;
    ours[0]?.before(ref);
    for (const s of ours) s.remove();
    (window as unknown as Record<string, HTMLStyleElement[]>).__scOurs = ours;
  }, { css, subjects, before: CONVERTED_BEFORE });

const swapBack = (page: Page) =>
  page.evaluate(() => {
    const ours = (window as unknown as Record<string, HTMLStyleElement[]>).__scOurs ?? [];
    const ref = document.getElementById('sc-css-reference');
    for (const s of ours) ref?.before(s);
    ref?.remove();
    for (const [el, cls] of (window as unknown as Record<string, [Element, string][]>).__scStripped ?? []) el.setAttribute('class', cls);
  });

const shot = (page: Page) => page.screenshot({ animations: 'disabled', caret: 'hide' });

/**
 * Chromium re-rasterizes after a stylesheet swap, and the edges of anti-aliased curves (wires, rounded corners) can
 * come out a few levels apart even with identical styles: mostly at most 5 of 255, now and then a lone pixel
 * further (seen on CI). Anything over NOISE counts, and up to STRAY such pixels are tolerated; the computed-style
 * check, which must match exactly, is what catches a CSS change (a real one moves far more pixels than that).
 */
const NOISE = 16;
export const STRAY = 50;

async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([sharp(a).raw().toBuffer({ resolveWithObject: true }), sharp(b).raw().toBuffer({ resolveWithObject: true })]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return x.info.width * x.info.height;
  let n = 0;
  const ch = x.info.channels;
  for (let i = 0; i < x.data.length; i += ch) {
    for (let c = 0; c < ch; c++)
      if (Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0)) > NOISE) {
        n++;
        break;
      }
  }
  return n;
}

/** Wait until the page stops changing on its own (a viewport glide, an image decoding, a debounced save). */
async function stable(page: Page): Promise<Buffer> {
  let last = await shot(page);
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    await settle(page);
    const next = await shot(page);
    if (next.equals(last)) return next;
    last = next;
  }
  throw new Error('the page never stopped changing');
}

/**
 * Compare the page as it stands with the app's CSS against `css` (the reference by default). The page ends as it
 * started. If the page itself changed while being compared (its own draw before and after differ), it starts over.
 */
export async function cssParity(page: Page, name: string, css = referenceCss()): Promise<CssParity> {
  for (let attempt = 0; ; attempt++) {
    if (attempt === 0) await probeWinners(page, name); // before the page settles: forcing states restarts transitions
    const app = await stable(page);
    await snapshot(page, '__scApp');
    await swapIn(page, css, convertedSubjects());
    await settle(page);
    await snapshot(page, '__scRef');
    const ref = await shot(page);
    const { styles, sameDom } = await page.evaluate(() => {
      const w = window as unknown as Record<string, Map<string, string>>;
      const a = w.__scApp ?? new Map<string, string>();
      const r = w.__scRef ?? new Map<string, string>();
      const sameDom = a.size === r.size && [...a.keys()].every((k) => r.has(k));
      const diffs: string[] = [];
      for (const k of new Set([...a.keys(), ...r.keys()])) {
        if (a.get(k) !== r.get(k)) diffs.push(`${k}: ${r.get(k) ?? '(none)'} → ${a.get(k) ?? '(none)'}`);
        if (diffs.length >= 40) break;
      }
      delete w.__scApp;
      delete w.__scRef;
      return { styles: diffs, sameDom };
    });
    await swapBack(page);
    await settle(page);
    const again = await shot(page);
    if ((!sameDom || !again.equals(app)) && attempt < 3) continue; // the page changed by itself meanwhile
    const pixels = await pixelDiff(app, ref);
    if (process.env.SC_SHOTS && (pixels || styles.length)) {
      await sharp(app).toFile(`${process.env.SC_SHOTS}/css-${name}-app.png`);
      await sharp(ref).toFile(`${process.env.SC_SHOTS}/css-${name}-reference.png`);
    }
    return { styles, pixels };
  }
}

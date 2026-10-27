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

/**
 * The computed styles to compare, keyed by each element's place in the DOM; custom properties are skipped (their
 * effect shows in the real ones). `scope` (the converted rules' selectors, areas.json) limits it to the elements those
 * rules styled at main, their ancestors and their descendants (which inherit from them); with no scope, every element.
 * The pixel diff always covers the whole page, so a change outside the scope still shows.
 */
const snapshot = (page: Page, key: string, scope: string[]) =>
  page.evaluate(({ key, scope }) => {
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
    // The off-screen frame a background export draws in (the project thumbnail, a few seconds after a save) is never
    // seen and comes and goes on its own timer, so it is left out.
    let wanted: Set<Element> | null = null;
    if (scope.length) {
      wanted = new Set<Element>();
      for (const sel of scope) {
        let hits: Element[] = [];
        try {
          hits = [...document.querySelectorAll(sel)];
        } catch {
          // a selector only the stylesheet understands
        }
        for (const hit of hits) {
          for (let e: Element | null = hit; e; e = e.parentElement) wanted.add(e);
          for (const d of hit.querySelectorAll('*')) wanted.add(d);
        }
      }
    }
    for (const el of [document.documentElement, ...document.querySelectorAll('body, body *')]) {
      if (wanted && !wanted.has(el)) continue;
      if (el.closest('body > div[aria-hidden="true"]')) continue;
      const path = pathOf(el) || 'html';
      record(path, getComputedStyle(el));
      for (const pseudo of ['::before', '::after', '::placeholder']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo === '::placeholder' ? el.matches('input, textarea') : cs.content !== 'none') record(`${path}${pseudo}`, cs);
      }
    }
    (window as unknown as Record<string, Map<string, string>>)[key] = out;
  }, { key, scope });

/** The elements to compare: those of the converted area (SC_PARITY_FULL=1, or no converted sheet: every element). */
const snapshotScope = () => (process.env.SC_PARITY_FULL ? [] : convertedSubjects());

/**
 * While a screen is compared, timers of 300 ms or more and idle callbacks wait (the project thumbnail drawn after a
 * save, the autosave, a notice's timeout): the page doesn't change under the comparison and start it over. They run
 * afterwards, when they would have.
 */
const holdTimers = (page: Page) =>
  page.evaluate(() => {
    type Held = { run: () => void; due: number };
    const w = window as unknown as Record<string, unknown>;
    if (w.__scHold) return;
    const st = window.setTimeout.bind(window);
    const ct = window.clearTimeout.bind(window);
    const ric = window.requestIdleCallback.bind(window);
    const cic = window.cancelIdleCallback.bind(window);
    const held = new Map<number, Held>();
    let next = 2_000_000_000;
    w.__scHold = { st, ct, ric, cic, held };
    window.setTimeout = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => {
      if (typeof fn !== 'function' || ms < 300) return st(fn, ms, ...args);
      const id = next++;
      held.set(id, { run: () => (fn as (...a: unknown[]) => void)(...args), due: performance.now() + ms });
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id === undefined || !held.delete(id)) ct(id);
    }) as typeof window.clearTimeout;
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      const id = next++;
      held.set(id, { run: () => cb({ didTimeout: false, timeRemaining: () => 0 }), due: 0 });
      return id;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = ((id: number) => {
      if (!held.delete(id)) cic(id);
    }) as typeof window.cancelIdleCallback;
  });

/** Puts the timers back and starts the held ones, each for the time it had left (a later clear still cancels it). */
const releaseTimers = (page: Page) =>
  page.evaluate(() => {
    type Held = { run: () => void; due: number };
    const w = window as unknown as Record<string, unknown>;
    const h = w.__scHold as { st: typeof setTimeout; ct: typeof clearTimeout; ric: typeof requestIdleCallback; cic: typeof cancelIdleCallback; held: Map<number, Held> } | undefined;
    if (!h) return;
    delete w.__scHold;
    const real = new Map<number, number>();
    const now = performance.now();
    for (const [id, t] of h.held) real.set(id, h.st(t.run, Math.max(0, t.due - now)) as unknown as number);
    window.setTimeout = h.st;
    window.clearTimeout = ((id?: number) => h.ct(id === undefined ? id : (real.get(id) ?? id))) as typeof window.clearTimeout;
    window.requestIdleCallback = h.ric;
    window.cancelIdleCallback = ((id: number) => (real.has(id) ? h.ct(real.get(id)) : h.cic(id))) as typeof window.cancelIdleCallback;
  });

/**
 * The app's own stylesheets (Vite serves each CSS file as a <style data-vite-dev-id>), Tailwind's and React Flow's
 * (through board/reactflow.css) included; the bundled fonts are not ours. The elements this branch converted lose
 * their utility classes (the ones the app's Tailwind sheet defines) while the reference is drawn, as they were at main.
 */
/**
 * Elements an earlier step converted that a rule this branch removes also styled: their classes from main must stay
 * while main's CSS is drawn (only this branch's additions come off). Set per conversion PR (T7a: the bar's rules for
 * none in T7b).
 * - KEEP: unchanged since main: they keep every class.
 * - MAIN_CLASSES: changed by this branch: they keep only the classes listed (what main gave them).
 */
const KEEP: string[] = [];
const MAIN_CLASSES: Record<string, string> = {};

const swapIn = (page: Page, css: string, subjects: string[]) =>
  page.evaluate(({ css, subjects, keepAll, mainClasses }) => {
    const ours = [...document.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id]')].filter((s) => {
      const id = s.dataset.viteDevId ?? '';
      return id.includes('/apps/web/src/') && !id.includes('/apps/web/src/fonts/');
    });
    if (!ours.length) throw new Error('no app stylesheets found');
    const utilities = ours.find((s) => (s.dataset.viteDevId ?? '').endsWith('/apps/web/src/tailwind.css'))?.textContent ?? '';
    // A whole class name in the sheet (`.bottom-0` is not `.bottom`, React Flow's). Our own hooks (`sc-…`) and React
    // Flow's classes are never utilities, though a utility's selector can name one (`[.sc-canvasbar>…_&]:`,
    // `[.react-flow\_\_node.selected_&]:`).
    const reactFlow = new Set(['selected', 'selectable', 'draggable', 'dragging', 'connectable', 'connectablestart', 'connectableend', 'connectionindicator', 'nodrag', 'nopan', 'nowheel', 'source', 'target', 'valid', 'connectingto', 'connectingfrom', 'updating', 'animated', 'inactive']);
    const isUtility = (c: string) => {
      if (c.startsWith('sc-') || c.startsWith('react-flow') || reactFlow.has(c)) return false;
      const name = `.${CSS.escape(c)}`;
      for (let i = utilities.indexOf(name); i >= 0; i = utilities.indexOf(name, i + 1)) if (!/[\w-]/.test(utilities[i + name.length] ?? '')) return true;
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
        if (stripped.some(([e]) => e === el) || keepAll.some((b) => el.matches(b))) continue;
        const fromMain = new Set(Object.entries(mainClasses).flatMap(([s, cls]) => (el.matches(s) ? cls.split(' ') : [])));
        const keep = [...el.classList].filter((c) => !isUtility(c) || fromMain.has(c));
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
  }, { css, subjects, keepAll: KEEP, mainClasses: MAIN_CLASSES });

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

/** Wait until the page stops changing on its own (a viewport glide, an image decoding): two equal draws in a row. */
async function stable(page: Page): Promise<Buffer> {
  let last = await shot(page);
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(50);
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
  await probeWinners(page, name); // before the page settles: forcing states restarts transitions
  await holdTimers(page);
  try {
    // Against any other CSS (the test's own self-check), every element counts.
    return await compare(page, name, css, css === referenceCss() ? snapshotScope() : []);
  } finally {
    await releaseTimers(page);
  }
}

async function compare(page: Page, name: string, css: string, scope: string[]): Promise<CssParity> {
  for (let attempt = 0; ; attempt++) {
    const app = await stable(page);
    await snapshot(page, '__scApp', scope);
    await swapIn(page, css, convertedSubjects());
    await settle(page);
    await snapshot(page, '__scRef', scope);
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

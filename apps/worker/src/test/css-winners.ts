/**
 * Tailwind conversion helper (P28): what one stylesheet actually decides on screen. For every element in a scope, its
 * computed style is read with the stylesheet on and with it switched off; a property that changes, and that a rule
 * of that sheet matching the element declares, is one the sheet wins — so it must move into a utility on that
 * element. The same is done with :hover and :focus-visible forced (DevTools protocol), and where the sheet wins at
 * rest but not in a state, the state's value is recorded too: a utility would beat the rule that wins there, so the
 * utility needs a variant. Run through the parity test:
 *   SC_PROBE=board/review.css SC_PROBE_SCOPE='.sc-review, .sc-review *' SC_PROBE_OUT=/tmp/winners.jsonl [SC_PROBE_SCREENS=a,b]
 * Each screen the test compares adds one line per element that the sheet styles.
 */
import { appendFileSync } from 'node:fs';
import type { Page } from 'playwright';

export async function probeWinners(page: Page, screen: string) {
  const sheet = process.env.SC_PROBE;
  const out = process.env.SC_PROBE_OUT;
  if (!sheet || !out) return;
  const screens = process.env.SC_PROBE_SCREENS?.split(','); // only these screens (all when unset)
  if (screens && !screens.includes(screen)) return;
  const scope = process.env.SC_PROBE_SCOPE ?? '*';
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  // Tag each element in scope so the DevTools protocol and the page agree on it.
  const count = await page.evaluate((scope) => {
    const els = [...document.querySelectorAll(scope)];
    els.forEach((e, i) => e.setAttribute('data-sc-probe', String(i)));
    return els.length;
  }, scope);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  for (let i = 0; i < count; i++) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-sc-probe="${i}"]` });
    if (!nodeId) continue; // gone since (a list that re-rendered)
    const result: Record<string, unknown> = {};
    for (const state of ['', 'hover', 'focus-visible']) {
      if (state) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] }).catch(() => undefined);
      result[state || 'rest'] = await page.evaluate(
        ({ i, sheet }) => {
          const el = document.querySelector(`[data-sc-probe="${i}"]`);
          const style = [...document.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id]')].find((s) => (s.dataset.viteDevId ?? '').endsWith(`/apps/web/src/${sheet}`));
          if (!el || !style?.sheet) return null;
          // The declarations of every rule of the sheet that matches the element now (media and state included).
          const declared = new Map<string, string[]>();
          const walk = (rules: CSSRuleList) => {
            for (const r of rules) {
              if (r instanceof CSSMediaRule) {
                if (matchMedia(r.conditionText).matches) walk(r.cssRules);
              } else if (r instanceof CSSLayerBlockRule || r instanceof CSSSupportsRule) walk(r.cssRules);
              else if (r instanceof CSSStyleRule) {
                const hit = (() => {
                  try {
                    return el.matches(r.selectorText);
                  } catch {
                    return false; // a selector the browser can't test from script (a pseudo-element)
                  }
                })();
                if (!hit) continue;
                for (let k = 0; k < r.style.length; k++) {
                  const p = r.style.item(k);
                  declared.set(p, [...(declared.get(p) ?? []), `${r.style.getPropertyValue(p)}${r.style.getPropertyPriority(p) ? ' !important' : ''}  ← ${r.selectorText}`]);
                }
              }
            }
          };
          walk(style.sheet.cssRules);
          if (!declared.size) return null;
          const on = getComputedStyle(el);
          const before = Object.fromEntries([...declared.keys()].map((p) => [p, on.getPropertyValue(p)]));
          style.sheet.disabled = true;
          const off = getComputedStyle(el);
          const wins: Record<string, { value: string; without: string; declared: string[] }> = {};
          for (const [p, d] of declared) if (before[p] !== off.getPropertyValue(p)) wins[p] = { value: before[p] ?? '', without: off.getPropertyValue(p), declared: d };
          const all = Object.fromEntries([...declared.keys()].map((p) => [p, before[p]]));
          style.sheet.disabled = false;
          const key = (e: Element) => e.localName + [...e.classList].map((c) => `.${c}`).join('') + (e.getAttribute('type') ? `[type=${e.getAttribute('type')}]` : '');
          const up: string[] = [];
          for (let e = el.parentElement; e && up.length < 2; e = e.parentElement) if (e.classList.length) up.unshift(key(e));
          return { key: `${up.join(' … ')} > ${key(el)}`, wins, all };
        },
        { i, sheet },
      );
      if (state) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => undefined);
    }
    if (result.rest || result.hover || result['focus-visible']) appendFileSync(out, `${JSON.stringify({ screen, ...result })}\n`);
  }
  await page.evaluate(() => document.querySelectorAll('[data-sc-probe]').forEach((e) => e.removeAttribute('data-sc-probe')));
  await cdp.detach();
}

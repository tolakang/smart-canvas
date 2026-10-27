// CSS guard (run by `pnpm lint`):
// 1. A colour written as hex belongs in a custom property (a token such as `--accent: #0965cf`), never inline in a
//    rule, so a theme or a palette change has one place to edit.
// 2. Every `sc-` class a stylesheet names is used by the app's code, so styles for removed markup don't pile up.
//    A class built at run time (`sc-slot--${shape}`) counts as used through its prefix; one named only inside
//    `:not(…)` (a rule that matches everything without it) is not checked.
// 3. No `-webkit-backdrop-filter`: the build adds it for Safari, and written after `backdrop-filter` it makes the
//    minifier (lightningcss) drop the standard one, so Chrome and Firefox lose the blur.
// 4. A selector is styled in one stylesheet only, so what an element looks like is decided in one place and moving a
//    file in the import order can't change it.
// 5. No hex colour in a Tailwind class either (`bg-[#fff]`): classes use the tokens (`bg-surface`, tailwind.css).
// 6. No new stylesheet: the UI is built with Tailwind utilities (D65, docs/FRONTEND.md). The list below only shrinks
//    as areas are converted.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const web = join(root, 'apps/web/src');
const list = (d, keep, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) list(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
};
const cssFiles = list(web, (p) => p.endsWith('.css') && !p.includes('/fonts/'));
const codeFiles = list(web, (p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p));
const code = codeFiles.map((p) => readFileSync(p, 'utf8')).join('\n');
const named = new Set(code.match(/sc-[\w-]+/g) ?? []);
const prefixes = [...code.matchAll(/(sc-[\w-]*?-)\$\{/g)].map((m) => m[1] ?? '');
const used = (c) => named.has(c) || prefixes.some((p) => c.startsWith(p));
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

const problems = [];
const STYLESHEETS = new Set([
  'styles.css', 'tailwind.css', 'board/reactflow.css', 'board/chrome.css', // tokens, base; Tailwind; React Flow
  'editor/editor.css', // not converted yet
]);
for (const file of cssFiles) {
  const name = relative(web, file);
  if (!STYLESHEETS.has(name)) problems.push(`${relative(root, file)}: a new stylesheet — style the markup with Tailwind utilities instead (docs/FRONTEND.md)`);
}
const owner = new Map(); // selector → the first file that styles it
for (const file of cssFiles) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const at = relative(root, file);
  // Each declaration runs from a `{` or `;` to the next `;` or `}`.
  const decls = /[{;]([^{};]*)/g;
  for (let m; (m = decls.exec(css)); ) {
    const decl = m[1] ?? '';
    if (/^\s*--[\w-]+\s*:/.test(decl)) continue;
    if (/^\s*-webkit-backdrop-filter\s*:/.test(decl))
      problems.push(`${at}:${lineAt(css, m.index + 1)}: -webkit-backdrop-filter — write backdrop-filter only; the build adds the prefix`);
    const hex = /#[0-9a-fA-F]{3,8}\b/.exec(decl);
    if (!hex || !decl.includes(':')) continue;
    problems.push(`${at}:${lineAt(css, m.index + 1 + decl.indexOf(hex[0]))}: ${hex[0]} inline — make it a token (--name: ${hex[0]}) and use var(--name)`);
  }
  // Selectors: the text before each `{` that isn't an at-rule.
  const selectors = /(^|[{}])([^{}@]+)\{/g;
  for (let m; (m = selectors.exec(css)); ) {
    let sel = m[2] ?? '';
    for (let prev = ''; prev !== sel; ) {
      prev = sel;
      sel = sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
    }
    for (const c of new Set(sel.match(/(?<=\.)sc-[\w-]+/g) ?? []))
      if (!used(c)) problems.push(`${at}:${lineAt(css, m.index + (m[1] ?? '').length)}: .${c} is not used by the app — remove its rules`);
    // Each selector in a list, split at the commas outside brackets, with its spaces normalized.
    for (const one of (m[2] ?? '').split(/,(?![^()[\]]*[)\]])/)) {
      const key = one.trim().replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ');
      if (!key || /^(from|to|[\d.]+%)$/.test(key)) continue;
      const first = owner.get(key);
      if (!first) owner.set(key, at);
      else if (first !== at) problems.push(`${at}:${lineAt(css, m.index + (m[1] ?? '').length)}: ${key} is also styled in ${first} — keep its rules in one file`);
    }
  }
}
for (const file of codeFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g))
    problems.push(`${relative(root, file)}:${lineAt(text, m.index)}: ${m[0]} — use a colour token (tailwind.css) instead of a hex value`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

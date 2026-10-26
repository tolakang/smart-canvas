// CSS guard (run by `pnpm lint`): a colour written as hex belongs in a custom property (a token such as
// `--accent: #0965cf`), never inline in a rule, so a theme or a palette change has one place to edit.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'apps/web/src');
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(d, e.name));
    else if (e.name.endsWith('.css') && !join(d, e.name).includes('/fonts/')) files.push(join(d, e.name));
  }
};
walk(dir);

const problems = [];
for (const file of files) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  // Each declaration runs from a `{` or `;` to the next `;` or `}`.
  const re = /[{;]([^{};]*)/g;
  for (let m; (m = re.exec(css)); ) {
    const decl = m[1] ?? '';
    if (/^\s*--[\w-]+\s*:/.test(decl)) continue;
    const hex = /#[0-9a-fA-F]{3,8}\b/.exec(decl);
    if (!hex || !decl.includes(':')) continue;
    const line = css.slice(0, m.index + 1 + (decl.indexOf(hex[0]) ?? 0)).split('\n').length;
    problems.push(`${relative(root, file)}:${line}: ${hex[0]} inline — make it a token (--name: ${hex[0]}) and use var(--name)`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

// Freeze the app's CSS at a git ref (default origin/main) for the CSS parity test (Tailwind conversion, P28):
// builds apps/web as it is at that ref and writes the built stylesheet to
// apps/worker/src/test/css-reference/styles.css. Run it at the start of each conversion PR, then commit the file.
//   node scripts/css-reference.mjs [ref]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ref = process.argv[2] ?? 'origin/main';
const sha = execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'css-reference-'));
try {
  // The web app and the workspace packages it imports, as they are at the ref; this checkout's node_modules.
  const files = execFileSync('git', ['archive', sha, 'apps/web', 'packages', 'package.json', 'tsconfig.base.json'], { cwd: root, maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', tmp], { input: files });
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'));
  symlinkSync(join(root, 'apps/web/node_modules'), join(tmp, 'apps/web/node_modules'));
  for (const p of readdirSync(join(tmp, 'packages'))) symlinkSync(join(root, 'packages', p, 'node_modules'), join(tmp, 'packages', p, 'node_modules'));
  const out = join(tmp, 'dist');
  execFileSync(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error', '--minify', 'false'], {
    cwd: join(tmp, 'apps/web'),
    stdio: 'inherit',
  });
  const assets = join(out, 'assets');
  const css = readdirSync(assets)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n')
    // The page already has the fonts; a second @font-face pointing at the other build's files would replace them.
    .replace(/@font-face\s*\{[^}]*\}/g, '');
  const target = join(root, 'apps/worker/src/test/css-reference/styles.css');
  writeFileSync(target, `/* The app's CSS at ${sha} (${ref}), built by scripts/css-reference.mjs. Do not edit. */\n${css}\n`);
  console.log(`wrote ${target} (${css.length} bytes) from ${ref} ${sha.slice(0, 7)}`);

  // The rules this branch converts (in the ref's stylesheets, gone from this checkout's): the elements they style had
  // no utility classes at the ref, so the parity test takes this branch's utility classes off those elements while it
  // draws the reference — otherwise the ref's own utilities (`.border`…) would style them.
  const changed = execFileSync('git', ['diff', '--name-only', sha, '--', 'apps/web/src'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.css') && !f.includes('/fonts/') && !f.endsWith('/tailwind.css'));
  const selectorsOf = (text) => {
    const out = new Set();
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[{}])([^{}@]+)\{/g))
      for (const one of (m[1] ?? '').split(/,(?![^()[\]]*[)\]])/)) {
        const s = one.trim().replace(/\s+/g, ' ');
        if (s && !/^(from|to|[\d.]+%)$/.test(s)) out.add(s);
      }
    return out;
  };
  const subjects = new Set();
  for (const f of changed) {
    let then = '';
    try {
      then = execFileSync('git', ['show', `${sha}:${f}`], { cwd: root, encoding: 'utf8' });
    } catch {
      continue; // new since the ref
    }
    const now = existsSync(join(root, f)) ? selectorsOf(readFileSync(join(root, f), 'utf8')) : new Set();
    for (const s of selectorsOf(then)) {
      if (now.has(s)) continue;
      // The element the rule styles, whatever its state: drop pseudo-elements and states.
      const subject = s.replace(/::?(before|after|backdrop|placeholder|selection)\b/g, '').replace(/:(hover|focus-visible|focus-within|focus|active|disabled)\b/g, '').replace(/:is\(\s*(,\s*)?\)/g, '').trim();
      if (subject) subjects.add(subject);
    }
  }
  const areas = join(root, 'apps/worker/src/test/css-reference/areas.json');
  writeFileSync(areas, `${JSON.stringify({ ref: sha, sheets: changed, subjects: [...subjects].sort() }, null, 2)}\n`);
  console.log(`wrote ${areas}: ${subjects.size} selectors from ${changed.join(', ') || 'no changed stylesheet'}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

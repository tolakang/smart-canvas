// Freeze the app's CSS at a git ref (default origin/main) for the CSS parity test (Tailwind conversion, P28):
// builds apps/web as it is at that ref and writes the built stylesheet to
// apps/worker/src/test/css-reference/styles.css. Run it at the start of each conversion PR, then commit the file.
//   node scripts/css-reference.mjs [ref]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    .replace(/@font-face\{[^}]*\}/g, '');
  const target = join(root, 'apps/worker/src/test/css-reference/styles.css');
  writeFileSync(target, `/* The app's CSS at ${sha} (${ref}), built by scripts/css-reference.mjs. Do not edit. */\n${css}\n`);
  console.log(`wrote ${target} (${css.length} bytes) from ${ref} ${sha.slice(0, 7)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

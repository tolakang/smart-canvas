// Bundles a Node app for production: our workspace packages (TS source) are inlined,
// third-party packages stay external and are installed by `pnpm deploy --prod`.
// Usage (from the app dir): node ../../scripts/bundle.mjs src/main.ts [more entries…]
import { build } from 'esbuild';

const entryPoints = process.argv.slice(2);
if (entryPoints.length === 0) throw new Error('usage: bundle.mjs <entry.ts>…');

await build({
  entryPoints,
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'external-third-party',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@smart-canvas/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});

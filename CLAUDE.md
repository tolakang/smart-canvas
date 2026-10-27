# CLAUDE.md — Artwork Adaptation app

Master artwork → many sizes. Flow board (D49): asset nodes → Layer Comp + Core preset → Preset nodes → Previews. Spec lives in `docs/` (copy of the Project files). Read `docs/00-READ-FIRST.md` first.

## Stack
pnpm monorepo · `apps/web` (React, TS, Vite, Tailwind CSS 4 on our tokens — D65, @xyflow/react v12, own transform box — D36) · `apps/api` (Fastify) · `apps/worker` (Playwright Chromium export, sharp) · `packages/core` (model, units, layout engine) · `packages/presets` · Postgres (Drizzle) · MinIO · pg-boss · Docker/Dokploy.

## Commands
`pnpm i` · `pnpm dev` · `pnpm test` (vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `docker compose up` (local stack)

## Rules
- One backlog ticket per session (`docs/BACKLOG.md`). Do not widen scope.
- Do not reopen locked decisions (`docs/DECISIONS.md`). If a ticket conflicts with one, stop and ask.
- `packages/core` is pure TypeScript: no DOM, no Node APIs, no I/O. Text measuring is injected.
- Model types come from `docs/DATA-MODEL.ts`. Change them only with a note in DECISIONS.md.
- Layout is computed, never stored. Only overrides (and `frozen` while disconnected) are stored.
- Preview and export use the same `OutputRenderer`. No second rendering path.
- Frontend work (styling, the board, the editors): follow `docs/FRONTEND.md`. Style UI with Tailwind utilities on our tokens. No new CSS rules except tokens, keyframes, React Flow overrides and the transform box.
- Every layout rule has a unit test from `docs/ADAPTATION-RULES.md` worked examples.
- Units: design px (96/in). Use `toDesignPx`, `canvasMetrics`, `exportPixels`; never hand-convert.
- Khmer: break words with `Intl.Segmenter('km')`; wait for `document.fonts.load` before measuring; same fonts in worker.
- Uploads: validate magic bytes; sanitize SVG (no scripts, no external refs); a PDF becomes a sanitized SVG (D55); 50 MB cap.
- Auth checks live in API middleware; viewer = read-only.
- No new dependency without saying why in the PR description.

## Done means
Tests pass, typecheck clean, ticket acceptance met, DECISIONS.md updated only if a decision changed.

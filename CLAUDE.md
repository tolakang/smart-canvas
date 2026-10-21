# CLAUDE.md — Artwork Adaptation app

Master artwork → many sizes. Flow board: Input sources → Main preview → Output nodes. Spec lives in `docs/` (copy of the Project files). Read `docs/00-READ-FIRST.md` first.

## Stack
pnpm monorepo · `apps/web` (React, TS, Vite, @xyflow/react v12, own transform box — D36) · `apps/api` (Fastify) · `apps/worker` (Playwright Chromium export, sharp) · `packages/core` (model, units, layout engine) · `packages/presets` · Postgres (Drizzle) · MinIO · pg-boss · Docker/Dokploy.

## Commands
`pnpm i` · `pnpm dev` · `pnpm test` (vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `docker compose up` (local stack)

## Rules
- One backlog ticket per session (`docs/BACKLOG.md`). Do not widen scope.
- Do not reopen locked decisions (`docs/DECISIONS.md`). If a ticket conflicts with one, stop and ask.
- `packages/core` is pure TypeScript: no DOM, no Node APIs, no I/O. Text measuring is injected.
- Model types come from `docs/DATA-MODEL.ts`. Change them only with a note in DECISIONS.md.
- Layout is computed, never stored. Only overrides (and `frozen` while disconnected) are stored.
- Preview and export use the same `OutputRenderer`. No second rendering path.
- Every layout rule has a unit test from `docs/ADAPTATION-RULES.md` worked examples.
- Units: design px (96/in). Use `toDesignPx`, `canvasMetrics`, `exportPixels`; never hand-convert.
- Khmer: break words with `Intl.Segmenter('km')`; wait for `document.fonts.load` before measuring; same fonts in worker.
- Uploads: validate magic bytes; sanitize SVG (no scripts, no external refs); 50 MB cap.
- Auth checks live in API middleware; viewer = read-only.
- No new dependency without saying why in the PR description.

## Done means
Tests pass, typecheck clean, ticket acceptance met, DECISIONS.md updated only if a decision changed.

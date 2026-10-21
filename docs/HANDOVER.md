# Handover — 2026-10-21

Read `CLAUDE.md`, then `docs/00-READ-FIRST.md`, `docs/DECISIONS.md` (latest D36) and `TASKS.md`. All backlog tickets (P1–P13) are done and merged. The work since then has been owner-requested UI fixes, one PR each.

## Workflow the owner expects
- **Branch:** `claude/gifted-archimedes-e2gjq4`, restarted from `origin/main` for each new piece of work. A force-with-lease push is fine when the branch only holds merged history.
- **Before pushing:** run `pnpm lint`, `pnpm typecheck`, `pnpm build`, then `TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres pnpm test`. Start Postgres first with `service postgresql start`. Build before the end-to-end tests, because they serve the built web app.
- **PRs:** open a PR, wait for CI to be green, squash merge with `expectedHeadSha`, then unsubscribe from the PR. "Do not ask me for small things."
- **Attribution:** commit trailers carry Co-Authored-By plus the Claude-Session link. PR bodies end with the "Generated with Claude Code" line. Never put a model name in commits or PRs.

## Recently merged
- **#83:** phone Export button; tap a wire, then the × button, to disconnect it.
- **#84:** projects page, Size presets and Team dialogs restyled (design-system buttons, rows and forms).
- **#85 (D36):** the editor's own transform box replaces react-moveable.
  - Affinity-style skew: drag an edge along itself and the opposite edge stays put.
  - On touch, hold before a handle drags.
  - A double-click on a handle undoes that handle's operations exactly; history is kept for the editor session.
  - Moves snap to edges and centres.
  - Model: optional `Frame.shear` / `NFrame.shear`.
  - Code: `apps/web/src/editor/transform/` (`math.ts` = operations, history and resets; `transform-box.ts` = DOM controller; `frame.ts` = frame bridge and snapping).

## Merged #86: board cards + Delete key — owner issues 3, 4, 5
- **Input cards** show only the name and a preview (`apps/web/src/board/nodes.tsx` `NodePreview`, slimmed `SourceHeader.tsx`). Settings and actions are in the Inspector (`Inspector.tsx` `InputActions`).
- **Card sizing:** cards size their column `minmax(0, 1fr)`, so thumbnails never overflow. Side ports sit level with the title (26 px), as the node palette assumes.
- **Delete / Backspace on the board** goes through `BoardKeys` to `deleteSelection` in `Board.tsx`, then the pure `board/delete-nodes.ts`, with one confirm and one undo step. It is not React Flow's `deleteKeyCode`: that one misses short key presses.
- **Delete in the editors:** in the main editor it works like the layer row's trash button (`MainEditor` `onDelete`); in an output editor it hides the layer there.
- **Tests:** new `apps/worker/src/board-delete.e2e.test.ts`. Tests that used node-level editors now use the Inspector, and a few board tests press "Fit to screen" before using nodes they just added. The full suite was green locally: 93 files, 490 tests.

## Owner issues 1 + 2 — image frames (D37, done)
Picture frames hug their visible pixels, and stretching distorts the picture.
- **Core:** `packages/core/src/fit.ts` (`fitFrames`, `fittedFrame`, `fillBoxes`, `unfitPictures`); `Frame.fitted` / `NFrame.fitted`.
- **Trim measurement:** `apps/web/src/render/trim.ts`, called by `useAssetSizes` (`board/layout-deps.ts`) and by `RenderPage.tsx`.
- **Board:** a fit pass in `Board.tsx`, applied without an undo step; replacing a picture unfits its frames (`editors.tsx`).
- **Renderer:** the fill mode in `OutputRenderer.tsx`.
- **Tests:** `fit.test.ts`, `trim.test.ts`, and `fitted-frames.e2e.test.ts` (hug, stretch, browser and worker parity with margins, replace).

## Known limits / ideas
- Resizes don't snap; only moves do.
- Transform history isn't saved with the project (a reset after a reload only undoes edits since the editor opened).
- Nodes added from the top bar can land off-screen; the board doesn't pan to show them.

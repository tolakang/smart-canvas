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

## Open PR (this branch): board cards + Delete key — owner issues 3, 4, 5
- **Input cards** show only the name and a preview (`apps/web/src/board/nodes.tsx` `NodePreview`, slimmed `SourceHeader.tsx`). Settings and actions are in the Inspector (`Inspector.tsx` `InputActions`).
- **Card sizing:** cards size their column `minmax(0, 1fr)`, so thumbnails never overflow. Side ports sit level with the title (26 px), as the node palette assumes.
- **Delete / Backspace on the board** goes through `BoardKeys` to `deleteSelection` in `Board.tsx`, then the pure `board/delete-nodes.ts`, with one confirm and one undo step. It is not React Flow's `deleteKeyCode`: that one misses short key presses.
- **Delete in the editors:** in the main editor it works like the layer row's trash button (`MainEditor` `onDelete`); in an output editor it hides the layer there.
- **Tests:** new `apps/worker/src/board-delete.e2e.test.ts`. Tests that used node-level editors now use the Inspector, and a few board tests press "Fit to screen" before using nodes they just added. The full suite was green locally: 93 files, 490 tests.

## Next: owner issues 1 + 2 — image frames (not started in code)
1. **"Frames are not trimmed to the transparent pieces."** Image and vector layers get a default box for their behaviour (`defaultPlacement`), and the picture is drawn `contain` inside it (`OutputRenderer` `Picture`), transparent margins included.
2. **"Stretching does not work with PNG."** With `contain`, stretching the frame just letterboxes the picture.

**Plan, agreed in design:**
- **Measure the visible pixels.** Find the opaque bounding box of each image or vector asset in the browser: draw it to a canvas no larger than 1024 px, scan the alpha channel, and store `trim` (normalised x/y/w/h) next to width/height in `useAssetSizes` (`board/layout-deps.ts`). `RenderPage.tsx` (worker export) must compute it the same way. Asset sizes are deps, not stored in the doc.
- **Fill new-style content to its frame.** Add optional `fill?: true` to image/vector content (a model change, so it needs a DECISIONS note). With `fill`, non-background pictures draw so the trimmed box exactly fills the frame, non-uniformly, which makes stretching distort as in Affinity. Extend `effectBoxes` (`packages/core/src/processes.ts`) with a fill mode that composes trim with a process crop. Backgrounds keep cover plus focal point.
- **Convert legacy layers without moving anything.** Add a pure core function that replaces a source's frames (placements in every composition, and override frames with w/h) with the trimmed box inside the old contain rect, then sets `fill`. The picture doesn't move on screen. Run it from the board once trims are known, and when an asset is uploaded or replaced (`useAssetUpload`, `setAsset`).
- **Outputs stay safe.** The layout engine keeps proportions in outputs (`mappedFrame` and `clampIntoSafe` scale uniformly; `logoFrame` keeps the ratio), so fill doesn't distort output layouts.
- **Tests:** unit tests for the trim scan, the conversion and `effectBoxes`; an e2e test that uploads a badge PNG with transparent margins, checks the editor frame hugs the badge, then stretches and checks it distorts.

## Known limits / ideas
- Resizes don't snap; only moves do.
- Transform history isn't saved with the project (a reset after a reload only undoes edits since the editor opened).
- Nodes added from the top bar can land off-screen; the board doesn't pan to show them.

# Handover — 2026-10-21 (updated after #91)

Read `CLAUDE.md`, then `docs/00-READ-FIRST.md`, `docs/DECISIONS.md` (latest D38) and `TASKS.md`. All backlog tickets (P1–P13) are done and merged. The work since then has been owner-requested UI fixes, one PR each.

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

## Merged #89: live stretch + touch without hold — owner issues 4, 5
- A fitted picture stretches live while its edge is dragged (`CanvasEditor.tsx` keeps `fitted` on the live frame).
- Touch: tap and drag at once; `longPressMs` defaults to 0. A double-tap on a handle resets it.

## Layout v3, the stretched grid (D38) — owner issues 1–3
- **Scale:** `√(sx·sy)` capped by the room around the pin (merged after #90 as a follow-up), fill rules unchanged.
- **Code:** `packages/core/src/layout/grid.ts` (`pinOf`, `fillsAxis`, `gridScale`, `gridFrame`), used by `index.ts` for subjects, decorations, logos (`logo.ts`, with the minimum width) and text boxes (`text.ts` `fitInFrame`).
- **Removed:** the v2 content groups (`content.ts`), the side text column and the safe-area clamp.
- **Spec:** `docs/ADAPTATION-RULES.md` v3 (examples A, C, D, E, J, K, L, I, F); unit tests in `grid.test.ts`, `logo.test.ts`, `text.test.ts`.

## Merged #91: grid scale
- Layers that don't fill the master scale by `√(sx·sy)` (their stretched grid box's area share), capped by the room around their pin so they stay inside the output, never below `k`. Spec examples A, D, E, J, L.

## Next — owner request (2026-10-21, with a board screenshot), NOT STARTED
1. **DONE (D40, PR after #92) — One Assets input slot, drag & drop many pictures at once.** Owner chose: **one Assets node, many layers.** A single input card holds all dropped pictures as a list (add, remove, reorder inside it). Each picture stays its own layer in the master preview (own placement, behaviour, processes/effects), wired automatically. The board shows one card and one wire instead of one card per picture (the screenshot had 8 "Subject copy copy…" cards).
   - Likely shape: keep one `InputSource` per picture (layout, processes, overrides, fit all work per source) and add a grouping, e.g. `InputSource.bundle?: string` plus `ProjectDoc.bundles?: { id, label, board }[]`. Sources in a bundle are drawn inside the Assets card, not as their own nodes; their source→composition edges are drawn as one wire from the card. Needs a model change note in DECISIONS (new D39), the API schema (`additionalProperties: false`), migration not needed if optional.
   - Code to read first: `packages/core/src/model.ts` (InputSource, LIMITS), `sources.ts`, `ports.ts` (`connectSource`), `apps/web/src/board/Board.tsx` + `nodes.tsx` (flow nodes/edges, `src:${id}` ids), `palette.ts` / `NodeLibrary.tsx` / canvas menu (add inputs), `Inspector.tsx` (`InputActions`), `board/delete-nodes.ts`, upload/drop handling and `apps/worker/src/drop.e2e.test.ts`.
2. **DONE (D39) — No limit on layers in the master preview.** `LIMITS.maxSources = 10` (`packages/core/src/model.ts:19`, enforced in `sources.ts` `canAddSource`, shown in UI and likely the API schema `maxItems`). Remove the cap (owner decision; note it in DECISIONS).
3. **DONE (D39) — Rename "Main preview" → "Master preview"** in UI copy: `MainNode.tsx`, `MainEditor.tsx` ("Master preview editor" dialog label — e2e tests use `/Master preview editor/`), `Inspector.tsx`, `Board.tsx`, `palette.ts`, `NodeLibrary.tsx`, defaults in `core/project.ts`, `compositions.ts`, `graph.ts` (migration label). Update tests and docs that match the text.

## Layout guides (D42) — PDF "Core Preset Guide"
- `packages/core/src/guides.ts` (`familyOfShape`, `guideFor`, `addGuides`, `detachGuide`); `computeLayout` takes positions from `guideFor` (falls back to the master per layer).
- UI: Inspector "Layout guides" section (`GuidesSection`), guide chip on `MainNode`, "· Vertical guide" on `OutputNode`.
- Page 3 plan (one PR each): 1. Background V/H pictures — **done (D43)**; 2. Headline asset node with Khmer / English slots + "Use" switch — **done (D44)**; 3. Layer Comp fixed order (logo top → headline → elements → background) — **done (D45)**; 4. Preset group node (GDN: many sizes, one preview each) — **done (D46)**; 5. Core Rule node — **done (D47)**. Logo and Image asset nodes already exist (logo input, Assets card).

## Known limits / ideas
- `output.family` is still computed and reported but no longer changes placement (D38).
- Resizes don't snap; only moves do.
- Transform history isn't saved with the project (a reset after a reload only undoes edits since the editor opened). Pictures are the exception for stretches: their own proportions are known (`pictureAspect`), so a stretch / scale handle reset takes an old stretch out of the box the editor started from (`restoreAspect`).
- Nodes added from the top bar can land off-screen; the board doesn't pan to show them.

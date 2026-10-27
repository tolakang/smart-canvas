# Handover — 2026-10-26 (P28 Tailwind conversion under way)

Read `CLAUDE.md`, then `docs/00-READ-FIRST.md`, `docs/DECISIONS.md` (latest **D65**), `docs/BACKLOG.md` (P15–P24 and **Next**) and `TASKS.md`. For any UI work, `docs/STYLING.md`: **the web app is built with Tailwind** on our tokens (owner, 2026-10-26: "build with tailwind"). The conversion of the older CSS goes on area by area (`TAILWIND-PLAN.md`); the next step is the first unticked T row in `TASKS.md` P28.

## Workflow the owner expects
- **Branch:** `claude/gifted-archimedes-e2gjq4`, restarted from `origin/main` for each piece of work. A force push is fine when the branch only holds merged history.
- **One PR per piece of work.** Open it, wait for CI to be green, squash merge with the full 40‑character `expectedHeadSha`, then unsubscribe from the PR. Standing instructions from the owner:
  - "Do not ask me for small things."
  - "Merge all when green."
- **Before pushing:**
  1. `pnpm lint`
  2. `pnpm typecheck`
  3. `pnpm build`.
  4. `service postgresql start`, then `TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres pnpm test`.

  Don't edit files while the full suite runs: the e2e tests serve `apps/web` through the Vite dev server, so an edit reloads their pages. The last full run was 105 files, 604 tests, all green. Don't rebase or check out while it runs either (a rebase rewrites files and reloads the pages too).
- **Attribution:**
  - Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`.
  - PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" plus the session link.
  - No model names in commits or PRs.
- **Big changes:** the owner wants **a full plan first** and approves it before work starts. They sent the page‑3 board design as a PDF and as screenshots. Follow the design; don't bolt new parts onto old structure.
- **Don't "fix" what the owner already accepted.** When the owner states a rule (e.g. "a reset never moves the element"), check whether the current behaviour already meets it before changing it (see #115 / #116).
- **CI:** `.github/workflows/ci.yml` caches Playwright's Chromium (`~/.cache/ms-playwright`, keyed by the Playwright version) and gives the check job 25 minutes; a fresh browser download once took 11 minutes and cut the tests off (#128). The check job takes about 4–5 minutes with the cache.
- **CI flakes seen:** e2e suites once timed out in `beforeAll` on a slow runner; a canvas test once read the doc before autosave (800 ms) had saved it — poll with a longer timeout rather than re-running.

## What changed recently (P15–P28, #108–#183)
- **P25 (#145–#151, D64):** the UI refresh: tokens and Inter (U1), board chrome (U2), floating panels and new cards (U3), editors (U4), Projects home, sign-in and dialogs (U5, U6), real project thumbnails (U5b), one name per thing and AA contrast (U7).
- **P26 (#153–#161):** asset and pipeline nodes redesigned (V1–V6): calm headers and solid icons, Core preset, phone editors' Layers | Design tabs, empty asset nodes keep their wire (D49.1).
- **P27 (#163–#176):** CSS cleanup with no visual change: every colour a token, unused rules removed, one file per board area, the lint guard (`scripts/check-css.mjs`).
- **P28 (#177–, D65):** Tailwind 4 on our tokens. T1 setup (#180: `tailwind.css`, cascade layers, the parity test back), dialogs (#181), Projects home and sign-in (#182), top bar and menus (#183). #179 fixed glass panels losing their blur in production builds.
- **P15 (#108–#117):** N1 Inspector speaks the page-3 board. N2 PDF uploads (D52). N3 several Khmer / English pairs per Headline node (D53). N4 Preset placement + Tidy board. N5 preset families as data, Save as team preset (D54). N6 a Preset node exports one ZIP. N7 resizes snap. #115 replayed the transform history for the reset buttons; the owner said the in-place reset was right, so #116 reverted it. #117 removed code the board no longer reaches.
- **P16 (#118, #119):** canvas tools (tooltips, Select / Hand, selection bar, Tidy icon, scissor badge) and the Projects screen (template cards, ⋯ menus, search / sort, New project dialog, rename).
- **P17 (#120–#123):** M2 turned / leaned layers snap on resize. M3 PDF pages kept as vector (D55). M4 preset families in the Size presets dialog (rename / delete a team family). M6 large exports made and zipped on the server.
- **P18 (#124, #125):** M1 a layer snaps to its spot in the other layouts. M5 retired engine features the board no longer offered (D56, schema 3).
- **#126:** docs, code and dev plan brought up to date after P15–P18.
- **P19 (#127–#129, D57):** board tools to the standard of design tools. #127 Select, Hand and keys (Shift-click, Esc, Ctrl/⌘+A, touch long-press adds to the selection, Space = Hand, saved arrow nudges). #128 grid snap (16 px, guides step aside, Alt skips, dots show the state, button on phones) and Tidy (selection or board, Shift+T, glide, notice with Undo), plus the CI browser cache. #129 made the Tidy e2e test always check Tidy selection and its Undo.
- **#130:** docs, code and dev plan brought up to date after P19 (the canvas menu says Tidy selection when it tidies the selection).
- **P20 (#131, #132, D58):** the board on touch screens like the design apps' phone versions. #131 move and zoom: one finger moves the board, a tap selects, a selected panel follows the finger, two fingers pinch and pan anywhere, double-tap zooms in. #132 select: long-press opens menus again, Select several (taps, a box, Done) replaces Select / Hand on touch.
- **P22 (#136–#138):** #136 Q1 pick a multi-page PDF's page (D59); #137 Q2 Preset nodes follow their team family (D60); #138 Q5 `output.family` retired, schema 4 (D61).
- **P23 (#139, #140, D62):** project history. #139 the API keeps versions on save (every 10 minutes of editing, before inputs or sizes are removed), named versions, restore, retention; #140 the History panel on the board.
- **P24 (#141–#143, D63):** review of Previews. #141 the API (`review_comments`, `output_approvals`) and core `previewFingerprint`; #142 comments (Comment tool, pins, Comments panel, count on nodes); #143 approval, the Review panel and the export warning.
- **#133:** docs after P20; a tap right after a finger box counts (React Flow waited for a click). **P21 (#134, #135, D58):** #134 Q7 the layout editors on touch like the board (supersedes D36's hold); #135 Q8 zoomed out on touch, a tap on a panel zooms to it.

## The product today (page‑3 board, D48–D58)
```
Logo · Headline (KH/EN) · Text · Image · Background (V/H)     ← asset nodes (purple), one ✂ wire each
                     ↓ into the top of the dashed group
        [ Layer Comp | Core preset ]                            ← the master (blue / mint)
                     ↓ drag out of the group's bottom port → preset popup
        Preset node (FB, IG, Story, GDN, App banner, Website, Gift, PR, team, Custom)   ← green
           each size row  ── eye · trash ──→ Preview (Edit = its overrides, Export)
```

**Asset nodes.** Each card holds items; you add, replace or delete each item. Pictures take PNG, JPG, WebP or SVG. A PDF's page is kept as vector — a PDF of several pages asks which one first (D59, `ui/PdfPageDialog.tsx`): the API draws it as a sanitized SVG with Poppler (D55, `apps/api/src/assets/pdf.ts`, `?page=N`); slots that take only pixels, or a server without the converter, get the browser's PNG of the same page (D52, `apps/web/src/pdf.ts`). All go through `uploadAsset` (cancel = `UploadCancelled`, no error shown).
- **Logo, Image and Text** are `AssetStack`s with `kind: 'logo' | 'image' | 'text'`. Logo items behave as logos (they get a minimum size).
- **Text** slots are each their own text layer. You type on the card, and the slot grows with its text. `addTextToStack` adds one.
- **Headline** is a `LanguagePair` (D44): a Khmer and an English picture, with a **Use** switch. **Add headline** adds more pairs to the same node (D53: `more`, `addPairRow`, `deletePairRow`, `pairInputs`); **Use** switches them all. Since V4 a pair shares one layout: switching hands the language coming in the place, size, rotation and Preview edits of the one going out (`shareLayout`), so only the picture changes. V4.1: with the pictures' measured sizes (`layoutDeps.assets`) `swapFrame` keeps the centre, area and stretch in the other picture's shape — exactly reversible, so switching never shrinks it.
- **Background** is one input with vertical and horizontal slots (D43). A square output uses either slot.

**Layer Comp.**
- The layer order is shown as four groups; drag them or use ↑ ↓ to reorder (D48: `ProjectDoc.layerOrder`, `moveLayerGroup`).
- **Square, Vertical, Horizontal** each open that layout's editor. A missing layout is added the first time it's opened (D42 guides).
- All three editors share the master's layers: order, wiring, show/hide, **lock** and delete apply everywhere. Position and size are per layout (D50: `masterScene` of a guide, `InputSource.locked`).

**Core preset** (V2; was "Core Rule").
- Always shows three sections listing Previews by the closest shape. Dragging a chip into another section sets `OutputNode.layout` (D50: `setOutputLayout`, `guideFor(…, chosen)`); × puts it back.
- The per-layer rules (`layerRule`) still drive every layout; since V2 they are not shown on the board (the Core Auto Layout Guide is gone).

**Preset node (D46, D51).**
- **Its team family (D60, Q2):** `setFamily(doc, setId, presets)` finds the family its sizes came from (by `presetId`); the node offers "Rename to “…”" when the family's name changed and "Add N new sizes" when the family grew.
- Rows reorder by their grip. Add a size from presets or as a custom W×H.
- The **eye** hides that size's Preview on the board (`PresetSet.hidden`; it still exports). The **trash** removes the size.
- **Export** opens the export dialog on the node's sizes only (hidden ones included unless "Include hidden previews" is unticked) and downloads one ZIP named `<project>_<family>.zip` once all are done (`exportZipName(project, family)`).
- **Save as team preset** (D54) saves the sizes as a team preset family.
- Row wires have no ✂ badge.

**Preview.**
- Header: "Preview" with the name and size, plus **Edit**.
- A live thumbnail and an **Export** pill.
- Cutting its wire freezes its layout (D20).

**Opening an old project** runs `boardStructure` once (`packages/core/src/board-structure.ts`, called in the fit effect in `Board.tsx`):
- Process nodes and extra master previews are deleted (the owner approved this; since D56 the v2 → v3 migration does it).
- Inputs join the node of their kind.
- Loose outputs go into a "Sizes" preset.
- A missing kind of asset node is added.

New projects come from `createBoardProject` (API `POST /projects`).

**Removed from the board:** process nodes, extra master previews, single outputs, the node library and palette, and the D47 Core Rule node (its UI code is gone too, #117). **D56** retired them from the model, engine, renderer and API too: documents are schema 3 (the master and its layouts, inputs, outputs, board nodes); **D61** made them schema 4 (no `output.family`), and `migrateProjectDoc` brings v1–v3 documents up on load and on save.

**History (D62, P23).** The server keeps earlier docs in `project_versions` (`apps/api/src/routes/versions.ts`): inside each save (`PUT`, row locked) `keepBeforeSave` copies the doc being replaced when the last version is 10 minutes old (`auto`) or the save has fewer inputs or sizes (`before-delete`, labelled "1 input", "2 sizes"); restore keeps the current doc first (`before-restore`) and writes the version as the next rev, so other open boards get 409 → "Reload latest". Named versions (up to 50) stay; the rest are pruned to 50. On the board, **History** (top bar; the More menu on phones) opens `board/HistoryPanel.tsx` in the inspector's place. A tap on a version shows it read-only: `Board` keeps the preview (`Previewing`) and the panel open across canvas remounts, saves the live board's pending edits first (`flushRef`), and remounts `BoardCanvas` with the version's doc, `readOnly` and a bar with **Restore** (editors) and **Close** (which reloads the live board). Viewers see and preview versions only.

**Review (D63, P24).** Comments and approvals live outside the doc (`apps/api/src/routes/review.ts`): viewers comment, undo / restore don't touch them. On the board, `useReview` (`board/review.ts`) loads them with the board, on window focus and every 30 s while a Preview editor or the Review panel is open; context carries `review`, `reloadReview`, `approvals` (`useApprovalStates`: only approved Previews are laid out, to compare `previewFingerprint` with the stored one) and `reviewApprove`. The Preview editor (`editor/OutputEditor.tsx`) has the Comment tool (pins via `CanvasEditor`'s `tools` / `overlay` / `onPoint` / `aside` props, `editor/CommentsPanel.tsx`) and the Approval group in its bar. Preview nodes show the approval and open count under the header; **Review** in the top bar (More on phones) opens `board/ReviewPanel.tsx` in the inspector's place (History and Review close each other). The export dialog marks sizes and warns only once the project has an approval.

**Board extras:** **Tidy board** (canvas toolbar and right-click menu) lays everything out; a new Preset node lands clear of other nodes.

**Editors:** moves and resizes snap to the canvas, the other layers (turned and leaned layers by their drawn bounds, M2) and the selected layer's spot in the master's other layouts (M1, `layerSpots`; a dashed, labelled outline shows each spot while dragging).

**Export:** files are made in the browser when they can be (D31). A multi-file export over 40 million raster pixels is made on the server and its ZIP streamed by the API, named by the Preset node's family (M6, `zipOnServer`, `GET …/exports/zip?ids=…&set=…`).

**Size presets dialog:** sizes by group plus "Preset node families" with their sizes; admins rename or delete a team family as a whole (M4, `PUT` / `DELETE /teams/:teamId/preset-families/:family`).

**Small panels (D58, T21.2).** On touch below 50 % zoom (`FAR_ZOOM`, tracked by `onMove`), capture listeners on the board stop a press inside a panel (pointerdown) and turn its tap (click) into select + `fitView` to that panel; ports pass through. Tests tap Edit twice at the fitted zoom (the first tap zooms).

**Editors on touch (D58, T21.1).** `CanvasEditor.tsx`: a finger not on the selected layer's box (`onTouchDown` / `onTouchMove` / `onTouchUp` on the stage) is a tap (select on lift; empty canvas twice = fit) or a pan; the transform box has `longPressMs: 0` and `onTap` (the selected layer tapped again → the one behind); `usePinch` (from `board/pinch.ts`, with `onPinch` cancelling the box's drag via `TransformBox.cancel()`) maps the editor's zoom / pan to a viewport.

**Touch (D58, T20.1–T20.2).** One finger moves the board (empty canvas, panels not selected, their buttons: `noPanClassName` is `TOUCH_NO_PAN` on touch, so a card's `nopan` counts with a mouse only); a tap selects, a selected panel follows the finger (`flowNodes` makes unselected panels non-draggable on touch, `nodeDragThreshold` 4); two fingers pinch and pan anywhere (`usePinch` in `board/pinch.ts`, capture phase, locked until every finger is up); double-tap zooms in. A long-press opens a menu (`useLongPress`, D33). **Select several** (T20.2) replaces Select / Hand on touch: `MultiSelect` in `CanvasToolbar.tsx` sets React Flow's `multiSelectionActive` (taps add or take out), finger panning goes off so one finger draws a box, and the selection bar shows Done. A finger box ends without a click, and React Flow would swallow the next tap waiting for one; `onSelectionEnd` in `Board.tsx` sends it that click (touch only). In e2e, Chrome moves a touch onto a control near it: grab panels at a point with no control within ~10 px (`grabPoint` / `grabAny` in `responsive.e2e.test.ts`), and keep Fit from zooming out to tiny panels; only input panels (`src:`) have a panel menu.

**Canvas tools (T16.1, T19, D57).** Shift-click adds a panel, Esc clears, Ctrl/⌘+A selects all, arrows nudge (saved, one undo step per run), holding Space is Hand while held (`BoardKeys` in `board-keys.tsx`). Select is the default with a mouse: click selects, drag moves a panel, a drag on empty canvas selects several (touch: see D58 below), and two or more selected show the selection bar (Group / Delete / clear). Hand moves the board only (`nodesDraggable` / `elementsSelectable` off). Toolbar buttons have tooltips (`ToolButton` in `CanvasToolbar.tsx`: hover 350 ms, keyboard focus, long press on touch). Wire badges use the owner's scissor icon (`ScissorIcon` in `RoutedEdge.tsx`). Groups take any panel id (`groups.ts` `exists`); a group's export includes its Preset nodes' sizes. Grid snap on: drops land on the 16 px grid and the alignment guides step aside; Alt skips snapping (`altRef` in `Board.tsx`); the dots show the state; the grid button shows on phones. Tidy (Shift+T) arranges the selection (`tidySelectionPositions`) or the board, on the grid when snap is on, glides (`sc-board__flow--tidying`) and shows a notice with Undo (`sc-board__toast`).

## Code map
| Area | Files |
|---|---|
| Board structure / conversion | `packages/core/src/board-structure.ts`; document migrations v1 → v2 → v3 in `graph.ts` (`migrateProjectDoc`, D56) |
| Cards | `stacks.ts` (`addStack`, `addPicturesToStack`, `addTextToStack`, `stackKind`), `languages.ts` (`addLanguagePair`, `addPairRow`, `deletePairRow`, `pairRows`, `pairInputs`) |
| Layer order | `layer-order.ts` (`orderLayers`, `layerOrderOf`, `moveLayerGroup`) |
| Layouts / guides | `guides.ts` (`guideFor`, `layoutOf`, `addGuides`, `pictureForShape`, `layerSpots`), `render.ts` (`masterScene`); layers a row can show: `layers.ts` (`layerSources`) |
| Core preset data | `core-rules.ts` (`layerComp`, `guideRows`, `setOutputLayout`, `layerRule`; all derived) |
| Preset sets | `preset-sets.ts` (`addPresetSet`, `connectSet`, `setPreviewHidden`, `presetFamilies` by `SizePreset.family`, D54); built-in families in `packages/presets`; a Preset node's **Save as team preset** in `PresetNode.tsx`; families renamed / deleted in `shell/PresetsDialog.tsx` (M4) |
| Layout engine | `layout/` (D38 stretched grid; `computeLayout` uses `guideFor(…, output.layout)`) |
| Board mapping | `apps/web/src/board/flow.ts` (`docToNodes`, `docToEdges`, `withPositions`, `LAYERS_HANDLE`, `cardEdgeId`); the Delete key: `delete-nodes.ts` |
| Board placement | `apps/web/src/board/tidy.ts`: `clearSpot` (a new Preset node and its Previews land clear of other nodes), `tidyPositions` (**Tidy board** in the canvas toolbar and the canvas menu, one undo step), `tidySelectionPositions` (**Tidy selection**, two or more selected), `onGrid` |
| Board UI | `Inspector.tsx` (Layer Comp: its three layouts via `useOpenLayout` from `MainNode.tsx`; Preview; asset nodes by kind), `Board.tsx` (wiring, menus, `+ Add`, preset popup, conversion on open), `MainNode.tsx` (Layer Comp + Core Rule group), `AssetsNode.tsx`, `TextNode.tsx`, `HeadlineNode.tsx`, `nodes.tsx` (Background), `PresetNode.tsx`, `OutputNode.tsx` (Preview), `RoutedEdge.tsx` (✂ badges, `noCut`) |
| Resets (owner, 2026-10-23: keep as is) | A reset never moves the element. Handle double-click: `resetForHandle` (that handle's drags removed from the history). The selection's **Reset rotation** / **Reset transform** buttons clear the rotation / skew **in place** (`resetRotation`, `resetTransform` in `geometry.ts`: centre and size kept). Replaying the history for the buttons was tried (#115) and reverted: it can move the element. |
| Editors | `apps/web/src/editor/` (`MainEditor` lists the master's layers in every layout; `CanvasEditor` skips locked layers; `LayersPanel`, `board/LayerRow.tsx` `LayerActions` incl. lock). Transform box: `editor/transform/` (`math.ts` history and resets, `frame.ts` `snapMove` / `snapResize`, `transform-box.ts`) |
| PDF uploads | API: `apps/api/src/assets/pdf.ts` (`pdftocairo -svg`, then the SVG sanitizer; 501 / 422 make the browser fall back). Browser: `apps/web/src/pdf.ts` (`pdfToPng`; pdf.js 5.4, lazy), from `uploadAsset` in `api.ts` (`{ pdf: 'image' }` for pixel-only slots) |
| Projects screen (T16.2) | `apps/web/src/shell/Projects.tsx` (template cards, search / sort `shownProjects`, ⋯ menus via `board/ContextMenu.tsx` with ↑ ↓ keys, `NewProjectDialog`), `ui/AskDialog.tsx` (the app's own name / confirm dialog, instead of prompt / confirm); rename: `PATCH /teams/:teamId/projects/:projectId` (name + doc.name, new rev) |
| API schema | `apps/api/src/routes/project-doc.schema.ts` (v3, plus v2 / v1 from clients that haven't reloaded, picked by `schema`; every new doc field must be added: `additionalProperties: false`) |
| Export | `packages/core/src/exports.ts` (`exportRoute`, `zipOnServer`), `apps/web/src/board/ExportDialog.tsx`, API `routes/exports.ts` (jobs, file, streamed ZIP) |
| Styling (D65) | Tokens: `apps/web/src/styles.css`; Tailwind theme: `tailwind.css`; shared class lists: `ui/tw.ts`, `ui/Brand.tsx`, `board/topbar.ts`, `board/panel.ts`, `board/frame.ts`, `board/card.ts`, `editor/shell.ts`, `editor/panels.ts`; CSS left as CSS: tokens and base (`styles.css`), React Flow's DOM (`board/chrome.css`, `board/reactflow.css`), the transform box (`editor/editor.css`); guard: `scripts/check-css.mjs`; rules: `docs/STYLING.md` |
| e2e helpers | `apps/worker/src/test/stack.ts`: `setupAndCreateProject` (waits for `.sc-comp-group`), `boardNode`, `putPicture`, `openLayout` (the Layer Comp's buttons; the inspector has the same ones) |

## Testing tips (learned the hard way)
- **CSS parity (P28):** `service postgresql start`, then `cd apps/worker && TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres npx vitest run src/css-parity-` (six files that run side by side; `SC_PARITY_ONLY=word,word` compares only the screens whose name has one of the words, commands in `TAILWIND-PLAN.md`). It compares every covered screen with main's built CSS; a conversion PR adds screens for the states it touches. The probe that lists what a sheet decides: `TAILWIND-PLAN.md`. If Postgres stopped (container restart), start it again.
- **Off‑screen nodes:** press **Fit to screen** before clicking a node the test just added, or one placed by the conversion.
- **Draggable rows:** a draggable row (HTML5 `draggable`) swallows wire drags that start on a handle inside it. Make only the grip draggable.
- **Shared ports:** many wires meet at the Layer Comp's `layers` port. Grab a wire by its node end (`edgeupdater-source`).
- **Hidden buttons:** buttons shown only on hover aren't in the accessibility tree. Use a CSS locator plus `dispatchEvent('click')`.
- **Lazy deps in e2e:** the e2e tests run the Vite dev server. A dependency imported lazily must be listed in `optimizeDeps.include` (`apps/web/vite.config.ts`), or Vite finds it mid‑test and reloads the page. pdf.js 6+ needs `Map.getOrInsertComputed`, which the test Chromium lacks; stay on 5.4.
- **Touch in e2e:** Chrome moves a touch that lands a few px from a panel onto the panel (touch adjustment): start a touch box-select well clear of panels. The first tap right after a CDP touch drag can be swallowed; wait ~600 ms.
- **Presets load late:** team presets load after the board. Re‑open a menu until a preset family is listed.
- **No-op passes:** when a test checks that an action changes something (Tidy, a nudge), set up a state where it must change, then require the change. Accepting "already tidy" let the Tidy test pass with nothing moved (#129).
- **Default project:** a new project wires every asset node. Tests that need fewer layers filter the layer edges in a PUT doc.

## Known limits
- History keeps whole docs, so an old version shows the pictures and fonts it used only while those assets exist; assets are never deleted today.
- None else known beyond the proposals in BACKLOG **Next**.

## Next
P28 (Tailwind conversion, `TASKS.md`) is in progress: T1–T5 done; T6, T7 one PR at a time, T8 optional. **UI/UX review (2026-10-27): `docs/UX-REVIEW.md`** — 22 findings and proposals A1–C3 with a suggested PR order; none approved yet, so build none until the owner picks (proposals tagged with a decision change a locked one). P1–P27 are done. The rest of the dev plan is Q6 (print colour, CMYK / PDF-X): planned in `docs/plans/Q6-print-colour.md` and **on hold** — the owner said "Do not dev it yet". Don't start it until the owner says go and answers its three open questions.

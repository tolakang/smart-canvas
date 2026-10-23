# Handover — 2026-10-23 (after #117)

Read `CLAUDE.md`, then `docs/00-READ-FIRST.md`, `docs/DECISIONS.md` (latest **D54**), `docs/BACKLOG.md` (P15 and **Next**) and `TASKS.md`. Everything below is merged to `main`. Nothing is open.

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

  Don't edit files while the full suite runs: the e2e tests serve `apps/web` through the Vite dev server, so an edit reloads their pages. The last full run was 103 files, all green.
- **Attribution:**
  - Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`.
  - PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" plus the session link.
  - No model names in commits or PRs.
- **Big changes:** the owner wants **a full plan first** and approves it before work starts. They sent the page‑3 board design as a PDF and as screenshots. Follow the design; don't bolt new parts onto old structure.
- **Don't "fix" what the owner already accepted.** When the owner states a rule (e.g. "a reset never moves the element"), check whether the current behaviour already meets it before changing it (see #115 / #116).
- **CI flakes seen:** e2e suites once timed out in `beforeAll` on a slow runner; a canvas test once read the doc before autosave (800 ms) had saved it — poll with a longer timeout rather than re-running.

## What changed in the last round (P15, #108–#116)
- N1 Inspector speaks the page-3 board. N2 PDF uploads (D52). N3 several Khmer / English pairs per Headline node (D53). N4 Preset placement + Tidy board. N5 preset families as data, Save as team preset (D54). N6 a Preset node exports one ZIP. N7 resizes snap. M2 turned / leaned layers snap on resize too. M3 PDF pages kept as vector (D55). M4 preset families in the Size presets dialog (rename / delete a team family).
- #115 changed the reset buttons to replay the transform history; the owner said the earlier in-place reset was right, so #116 reverted it.
- #117 removed code the page-3 board no longer reaches (process / Core Rule node UI, the process inspector, unused helpers) and tidied these docs.

## The product today (page‑3 board, D48–D54)
```
Logo · Headline (KH/EN) · Text · Image · Background (V/H)     ← asset nodes (purple), one ✂ wire each
                     ↓ into the top of the dashed group
        [ Layer Comp | Core Rule ]                              ← the master (blue / mint)
                     ↓ drag out of the group's bottom port → preset popup
        Preset node (FB, IG, Story, GDN, App banner, Website, Gift, PR, team, Custom)   ← green
           each size row  ── eye · trash ──→ Preview (Edit = its overrides, Export)
```

**Asset nodes.** Each card holds items; you add, replace or delete each item. Pictures take PNG, JPG, WebP or SVG; a PDF goes up as its first page, a PNG (D52, `apps/web/src/pdf.ts`, called from `uploadAsset`).
- **Logo, Image and Text** are `AssetStack`s with `kind: 'logo' | 'image' | 'text'`. Logo items behave as logos (they get a minimum size).
- **Text** slots are each their own text layer. You type on the card, and the slot grows with its text. `addTextToStack` adds one.
- **Headline** is a `LanguagePair` (D44): a Khmer and an English picture, with a **Use** switch. **Add headline** adds more pairs to the same node (D53: `more`, `addPairRow`, `deletePairRow`, `pairInputs`); **Use** switches them all.
- **Background** is one input with vertical and horizontal slots (D43). A square output uses either slot.

**Layer Comp.**
- The layer order is shown as four groups; drag them or use ↑ ↓ to reorder (D48: `ProjectDoc.layerOrder`, `moveLayerGroup`).
- **Square, Vertical, Horizontal** each open that layout's editor. A missing layout is added the first time it's opened (D42 guides).
- All three editors share the master's layers: order, wiring, show/hide, **lock** and delete apply everywhere. Position and size are per layout (D50: `masterScene` of a guide, `InputSource.locked`).

**Core Rule.**
- **Core Preset Guide** has three sections listing outputs by the closest shape. Dragging a chip into another section sets `OutputNode.layout` (D50: `setOutputLayout`, `guideFor(…, chosen)`).
- **Core Auto Layout Guide** shows each layer's rule (`layerRule`).

**Preset node (D46, D51).**
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
- Process nodes and extra master previews are deleted (the owner approved this).
- Inputs join the node of their kind.
- Loose outputs go into a "Sizes" preset.
- A missing kind of asset node is added.

New projects come from `createBoardProject` (API `POST /projects`).

**Removed from the board:** process nodes, extra master previews, single outputs, the node library and palette, and the D47 Core Rule node (its UI code is gone too, #117). The **engine, export and API schema still support** processes, nested compositions, output-only layers and a stored `coreRules` field (old documents load; `boardStructure` drops what the board can't show). Whether to remove them is BACKLOG M5.

**Board extras:** **Tidy board** (canvas toolbar and right-click menu) lays everything out; a new Preset node lands clear of other nodes. Moves and resizes snap to the canvas and the other layers in the editors.

**Canvas tools (T16.1).** Select is the default on every device: click / tap selects, drag moves a panel, a drag on empty canvas selects several (on touch, finger panning is off in Select so React Flow can draw the box; two fingers pan and pinch), and two or more selected show the selection bar (Group / Delete / clear). Hand moves the board only (`nodesDraggable` / `elementsSelectable` off). Toolbar buttons have tooltips (`ToolButton` in `CanvasToolbar.tsx`: hover 350 ms, keyboard focus, long press on touch). Wire badges use the owner's scissor icon (`ScissorIcon` in `RoutedEdge.tsx`). Groups take any panel id (`groups.ts` `exists`); a group's export includes its Preset nodes' sizes.

## Code map
| Area | Files |
|---|---|
| Board structure / conversion | `packages/core/src/board-structure.ts` |
| Cards | `stacks.ts` (`addStack`, `addPicturesToStack`, `addTextToStack`, `stackKind`), `languages.ts` (`addLanguagePair`, `addPairRow`, `deletePairRow`, `pairRows`, `pairInputs`) |
| Layer order | `layer-order.ts` (`orderLayers`, `layerOrderOf`, `moveLayerGroup`) |
| Layouts / guides | `guides.ts` (`guideFor`, `layoutOf`, `addGuides`, `pictureForShape`), `render.ts` (`masterScene`) |
| Core Rule data | `core-rules.ts` (`layerComp`, `guideRows`, `setOutputLayout`, `layerRule`; all derived) |
| Preset sets | `preset-sets.ts` (`addPresetSet`, `connectSet`, `setPreviewHidden`, `presetFamilies` by `SizePreset.family`, D54); built-in families in `packages/presets`; a Preset node's **Save as team preset** in `PresetNode.tsx`; families renamed / deleted in `shell/PresetsDialog.tsx` (M4) |
| Layout engine | `layout/` (D38 stretched grid; `computeLayout` uses `guideFor(…, output.layout)`) |
| Board mapping | `apps/web/src/board/flow.ts` (`docToNodes`, `docToEdges`, `withPositions`, `LAYERS_HANDLE`, `cardEdgeId`); the Delete key: `delete-nodes.ts` |
| Board placement | `apps/web/src/board/tidy.ts`: `clearSpot` (a new Preset node and its Previews land clear of other nodes), `tidyPositions` (**Tidy board** in the canvas toolbar and the canvas menu, one undo step) |
| Board UI | `Inspector.tsx` (Layer Comp: its three layouts via `useOpenLayout` from `MainNode.tsx`; Preview; asset nodes by kind), `Board.tsx` (wiring, menus, `+ Add`, preset popup, conversion on open), `MainNode.tsx` (Layer Comp + Core Rule group), `AssetsNode.tsx`, `TextNode.tsx`, `HeadlineNode.tsx`, `nodes.tsx` (Background), `PresetNode.tsx`, `OutputNode.tsx` (Preview), `RoutedEdge.tsx` (✂ badges, `noCut`) |
| Resets (owner, 2026-10-23: keep as is) | A reset never moves the element. Handle double-click: `resetForHandle` (that handle's drags removed from the history). The selection's **Reset rotation** / **Reset transform** buttons clear the rotation / skew **in place** (`resetRotation`, `resetTransform` in `geometry.ts`: centre and size kept). Replaying the history for the buttons was tried (#115) and reverted: it can move the element. |
| Editors | `apps/web/src/editor/` (`MainEditor` lists the master's layers in every layout; `CanvasEditor` skips locked layers; `LayersPanel`, `board/LayerRow.tsx` `LayerActions` incl. lock). Transform box: `editor/transform/` (`math.ts` history and resets, `frame.ts` `snapMove` / `snapResize`, `transform-box.ts`) |
| PDF uploads | `apps/web/src/pdf.ts` (`pdfToPng`, called from `uploadAsset` in `api.ts`; pdf.js 5.4, lazy) |
| Projects screen (T16.2) | `apps/web/src/shell/Projects.tsx` (template cards, search / sort `shownProjects`, ⋯ menus via `board/ContextMenu.tsx` with ↑ ↓ keys, `NewProjectDialog`), `ui/AskDialog.tsx` (the app's own name / confirm dialog, instead of prompt / confirm); rename: `PATCH /teams/:teamId/projects/:projectId` (name + doc.name, new rev) |
| API schema | `apps/api/src/routes/project-doc.schema.ts` (every new doc field must be added: `additionalProperties: false`) |
| e2e helpers | `apps/worker/src/test/stack.ts`: `setupAndCreateProject` (waits for `.sc-comp-group`), `boardNode`, `putPicture`, `openLayout` (the Layer Comp's buttons; the inspector has the same ones) |

## Testing tips (learned the hard way)
- **Off‑screen nodes:** press **Fit to screen** before clicking a node the test just added, or one placed by the conversion.
- **Draggable rows:** a draggable row (HTML5 `draggable`) swallows wire drags that start on a handle inside it. Make only the grip draggable.
- **Shared ports:** many wires meet at the Layer Comp's `layers` port. Grab a wire by its node end (`edgeupdater-source`).
- **Hidden buttons:** buttons shown only on hover aren't in the accessibility tree. Use a CSS locator plus `dispatchEvent('click')`.
- **Lazy deps in e2e:** the e2e tests run the Vite dev server. A dependency imported lazily must be listed in `optimizeDeps.include` (`apps/web/vite.config.ts`), or Vite finds it mid‑test and reloads the page. pdf.js 6+ needs `Map.getOrInsertComputed`, which the test Chromium lacks; stay on 5.4.
- **Touch in e2e:** Chrome moves a touch that lands a few px from a panel onto the panel (touch adjustment): start a touch box-select well clear of panels. The first tap right after a CDP touch drag can be swallowed; wait ~600 ms.
- **Presets load late:** team presets load after the board. Re‑open a menu until a preset family is listed.
- **Default project:** a new project wires every asset node. Tests that need fewer layers filter the layer edges in a PUT doc.

## Known limits
- Snapping between layouts' guides isn't built (BACKLOG M1, needs a definition).
- PDF uploads keep only the first page (as vector, D55; as pixels in pixel-only slots, D52).
- `output.family` is computed but no longer changes placement (D38).
- A Preset node's ZIP is made in the browser (M6).

## Next
Owner picked M2, M3, M4, M6 (P17, in that order); M1 needs a definition and M5 is the owner's call. Proposals at the end of `docs/BACKLOG.md`.

# Handover — 2026-10-23 (after #106)

Read `CLAUDE.md`, then `docs/00-READ-FIRST.md`, `docs/DECISIONS.md` (latest **D53**), `docs/BACKLOG.md` (P14 and **Next**) and `TASKS.md`. Everything below is merged to `main`. Nothing is open.

## Workflow the owner expects
- **Branch:** `claude/gifted-archimedes-e2gjq4`, restarted from `origin/main` for each piece of work. A force push is fine when the branch only holds merged history.
- **One PR per piece of work.** Open it, wait for CI to be green, squash merge with the full 40‑character `expectedHeadSha`, then unsubscribe from the PR. Standing instructions from the owner:
  - "Do not ask me for small things."
  - "Merge all when green."
- **Before pushing:**
  1. `pnpm lint`
  2. `pnpm typecheck`
  3. `pnpm build`. The end‑to‑end tests serve the built web app, so build first.
  4. `service postgresql start`, then `TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres pnpm test`.
  
  Don't edit files while the full suite runs. The last full run was 101 files and 561 tests, all green.
- **Attribution:**
  - Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`.
  - PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" plus the session link.
  - No model names in commits or PRs.
- **Big changes:** the owner wants **a full plan first** and approves it before work starts. They sent the page‑3 board design as a PDF and as screenshots. Follow the design; don't bolt new parts onto old structure.
- **CI flake seen once:** two e2e suites timed out in `beforeAll` waiting for the first‑run page on a slow runner. One re‑run of the failed job passed.

## The product today (page‑3 board, D48–D51)
```
Logo · Headline (KH/EN) · Text · Image · Background (V/H)     ← asset nodes (purple), one ✂ wire each
                     ↓ into the top of the dashed group
        [ Layer Comp | Core Rule ]                              ← the master (blue / mint)
                     ↓ drag out of the group's bottom port → preset popup
        Preset node (FB, IG, Story, GDN, App banner, Website, Gift, PR, Custom)   ← green
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

**Removed from the board:** process nodes, extra master previews, single outputs, the node library and palette, and the D47 Core Rule node. The **engine and export still support** text, processes and nested compositions; only the board no longer offers them.

## Code map
| Area | Files |
|---|---|
| Board structure / conversion | `packages/core/src/board-structure.ts` |
| Cards | `stacks.ts` (`addStack`, `addPicturesToStack`, `addTextToStack`, `stackKind`), `languages.ts` (`addLanguagePair`, `addPairRow`, `deletePairRow`, `pairRows`, `pairInputs`) |
| Layer order | `layer-order.ts` (`orderLayers`, `layerOrderOf`, `moveLayerGroup`) |
| Layouts / guides | `guides.ts` (`guideFor`, `layoutOf`, `addGuides`, `pictureForShape`), `render.ts` (`masterScene`) |
| Core Rule data | `core-rules.ts` (`layerComp`, `guideRows`, `setOutputLayout`, `layerRule`) |
| Preset sets | `preset-sets.ts` (`addPresetSet`, `connectSet`, `setPreviewHidden`, `presetFamilies`) |
| Layout engine | `layout/` (D38 stretched grid; `computeLayout` uses `guideFor(…, output.layout)`) |
| Board mapping | `apps/web/src/board/flow.ts` (`docToNodes`, `docToEdges`, `LAYERS_HANDLE`, `cardEdgeId`, `connectionRefusal`) |
| Board UI | `Inspector.tsx` (Layer Comp: its three layouts via `useOpenLayout` from `MainNode.tsx`; Preview; asset nodes by kind), `Board.tsx` (wiring, menus, `+ Add`, preset popup, conversion on open), `MainNode.tsx` (Layer Comp + Core Rule group), `AssetsNode.tsx`, `TextNode.tsx`, `HeadlineNode.tsx`, `nodes.tsx` (Background), `PresetNode.tsx`, `OutputNode.tsx` (Preview), `RoutedEdge.tsx` (✂ badges, `noCut`) |
| Editors | `apps/web/src/editor/` (`MainEditor` lists the master's layers in every layout; `CanvasEditor` skips locked layers; `LayersPanel`, `board/LayerRow.tsx` `LayerActions` incl. lock) |
| API schema | `apps/api/src/routes/project-doc.schema.ts` (every new doc field must be added: `additionalProperties: false`) |
| e2e helpers | `apps/worker/src/test/stack.ts`: `setupAndCreateProject` (waits for `.sc-comp-group`), `boardNode`, `putPicture`, `openLayout` (the Layer Comp's buttons; the inspector has the same ones) |

## Testing tips (learned the hard way)
- **Off‑screen nodes:** press **Fit to screen** before clicking a node the test just added, or one placed by the conversion.
- **Draggable rows:** a draggable row (HTML5 `draggable`) swallows wire drags that start on a handle inside it. Make only the grip draggable.
- **Shared ports:** many wires meet at the Layer Comp's `layers` port. Grab a wire by its node end (`edgeupdater-source`).
- **Hidden buttons:** buttons shown only on hover aren't in the accessibility tree. Use a CSS locator plus `dispatchEvent('click')`.
- **Lazy deps in e2e:** the e2e tests run the Vite dev server. A dependency imported lazily must be listed in `optimizeDeps.include` (`apps/web/vite.config.ts`), or Vite finds it mid‑test and reloads the page. pdf.js 6+ needs `Map.getOrInsertComputed`, which the test Chromium lacks; stay on 5.4.
- **Presets load late:** team presets load after the board. Re‑open a menu until a preset family is listed.
- **Default project:** a new project wires every asset node. Tests that need fewer layers filter the layer edges in a PUT doc.

## Known limits
- PDF uploads keep only the first page, as pixels (D52).
- `output.family` is computed but no longer changes placement (D38).
- Resizes don't snap; only moves do.
- A Preset node added by right‑click lands where you clicked. Its Previews can then overlap other nodes until moved. "+ Add" places it under the group.

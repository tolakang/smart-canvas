# DECISIONS (locked unless marked Open)

## Product
- D1 Team app: login, shared projects, roles admin/editor/viewer.
- D2 Outputs for screen and print. Size per output in px or mm, bleed for print. CMYK / PDF-X are later (v2).
- D3 Khmer + Latin text. Bundle Khmer fonts, allow font upload (ttf/otf/woff2). Word breaks via `Intl.Segmenter('km')`. Same fonts in browser and export worker.
- D4 Subjects are transparent PNG cutouts. Background removal is v2.
- D5 No AI in v1. Rules only.
- D6 Import formats: SVG, PNG, JPG, WebP. Not supported: PSD, AI, PDF, legacy Affinity. No `.af` (Affinity 3) import: dropped by the owner (2026-10-20), too hard to read reliably; export from Affinity to SVG/PNG instead. (S1, T7.6 dropped.)

## Board and inputs
- D7 One main preview per project. ~~Up to 10 input sources (the 4 defaults count)~~ (superseded by D39: no layer limit) and up to 10 outputs.
- D8 New project starts with 4 inputs: Background, Subject, Headline, Logo. "+ Add input" adds more: type = image | vector | text | fill; behavesLike = background | subject | text | logo | decoration (new source copies that behaviour's rules). Defaults can be renamed, hidden, duplicated, deleted.
- D9 Background accepts a photo or a solid colour / gradient (fill).
- D10 One text source = one text box, one style. Small print = another text source.
- D11 Each input has a port on the main preview. Port 0 = front layer. Re-order by dragging the list or re-wiring.
- D12 Wires: input → main (port), main → output. Output can be disconnected (frozen) and reconnected. ~~No chaining.~~ Superseded by D32 (node graph); disconnect/freeze/reconnect of outputs stays.
- D13 Every output has its own editable preview panel (move, resize, restyle any layer).
- D14 Team library: save a source (logo, text preset, fill, image) and reuse it in any project of the team.

## Sizes
- D15 Main preview default 3000×3000 px; user can change (px or mm).
- D16 Size presets in two groups: print, social. Editable by admins. User can change any output's size anytime. px/mm toggle per node.
- D17 Layout space = "design px" at 96 per inch. Export pixels = design px × scale (mm outputs: dpi/96; px outputs: 1x–4x multiplier). Caps in LIMITS.

## Adaptation and overrides
- D18 Layout is deterministic and recomputed; only overrides are stored.
- D19 Override = per (output, source) partial frame/style/hidden. Shown with a lock icon. "Reset to auto" per layer and per output.
- D20 Master change: connected outputs re-flow automatically, overrides kept.
- D21 Reconnect an output: no overrides → re-sync silently. Overrides exist → ask first (keep overrides / reset all / cancel).

## Export
- D22 Formats PNG, JPG, WebP, SVG, PDF. Download one output or all as ZIP. Background queue with progress.
- D23 SVG: option to convert text to outlines. PDF: crop marks option (on by default for outputs with bleed, user can disable). PDF is RGB in v1.

## Auth
- D24 Simple: email + password (argon2id), invite links, httpOnly session cookie. Google/Telegram sign-in later.

## Tech
- D25 Monorepo (pnpm): `apps/web` React+TS+Vite, `apps/api` Fastify, `apps/worker` export worker, `packages/core` (types, units, layout engine), `packages/presets`.
- D26 Board: `@xyflow/react` v12. **Renderer: DOM/SVG + react-moveable for editing, not react-konva** (editing part superseded by D36) (changed from earlier chat: identical rendering for preview and export, vector PDF with live text).
- D27 Export: worker drives headless Chromium (Playwright) against a `/render/:outputId` route. PNG/JPG via screenshot, WebP via sharp, PDF via page.pdf. Amended by D31: the worker is now the fallback and the path for PDF / large files.
- D28 Postgres (Drizzle ORM) + MinIO (S3 API) + pg-boss queue (no Redis). Project document stored as JSONB with a revision number (optimistic lock).
- D30 Layout v2 — content fit (2026-10-20, owner's choice after board feedback; **superseded by D38**): subjects, decorations and texts are fitted as a group into the output's safe area (size scale between v1's contain `k` and the master's cover `K`; positions spread per axis to use the space); wide outputs put visuals on the right half and text in a left column, each taking all of the safe area when alone. Backgrounds and logos keep their v1 rules; overrides still win (D18–D21 unchanged). Spec: `docs/ADAPTATION-RULES.md` v2.
- D29 Deploy: Dokploy compose (web, api, worker, postgres, minio). Multi-arch images (amd64 staging, arm64 production).

## Open (default applies until you decide)
- O1 Preset sizes: verify against current platform docs before seeding. Default list in `packages/presets`.
- O2 Defaults: safe margin 5%, print bleed 3 mm, print dpi 300, min font 12 design px, min logo width 8%.
- O3 Caps: max export edge 12000 px, max upload 50 MB.
- O4 `.af` import: closed — dropped (see D6).
- O5 SVG text outlines method: harfbuzzjs + fontkit, to be proven in spike S3. → S3 passed with harfbuzzjs alone (shaping + glyph outlines, within 1 px of the screen); fontkit not needed for outlining. See `docs/spikes/S3-SVG-OUTLINES.md`.
- O6 Undo/redo scope: board edits and editor edits, per session (T7.2).
- O7 "Frozen" (disconnected) output freezes layout frames only; text and image content edits still show. Change to full freeze (content snapshot) if you prefer.

## Changes (2026-10-20, owner decisions)
- D31 Hybrid export (amends D27, D22). Export runs in the user's browser when it can, so the server is used only when it must:
  - **Browser:** SVG (live text), and PNG / JPG / WebP up to 4096 px on the long edge. The browser draws the same `OutputRenderer` DOM to a canvas, with fonts and images inlined; several files are zipped in the browser.
  - **Server worker (unchanged path):** PDF, SVG with text outlines, rasters over 4096 px, and Safari or any browser that fails a feature check. A browser export that throws retries on the server automatically.
  - The export dialog shows where each file is made ("in your browser" / "on the server"). Caps (O3) and options are unchanged.
- D32 Node graph (supersedes D12 "no chaining"; D11 port order kept per composition). The board becomes a typed node graph; see `docs/NODE-GRAPH.md`.
  - Node types: inputs (as today), process nodes (layer → layer), compositions (several "main previews"), outputs.
  - Wires connect typed ports (layer, composition). Cycles are refused.
  - An output takes one composition and can also take extra output-only layers.
  - Layout is still computed and never stored (D30 rules per composition). Preview and export still use one `OutputRenderer`.
  - The model moves to `schema: 2`; v1 documents are migrated on load (pure function in core, tested). Model change note (T12.1): `master` + `wires` + `InputSource.port` became `compositions[]` (rows in `layers`) + typed `edges` + `processes[]`.
  - Model change note (T12.4): `OutputNode.layers?: string[]` holds an output's own rows (output-only layers), front first, like `Composition.layers`. It is optional, so no migration is needed. A row draws while a `layer` edge feeds it. A layer the output's composition already draws is refused on the board and skipped by the layout (the composition wins).
  - Model change note (T13.7): `ProjectDoc.groups?: BoardGroup[]` (`{ id, label, color, nodes, collapsed? }`) holds board groups. It is optional, so no migration is needed. Groups only organise the board: a group's frame is computed from its members' positions and never stored, and it never affects a layout. Members that no longer exist are ignored, and a node is in one group at most.
  - Model change note (T13.8): `Edge.points?: {x, y}[]` holds a wire's reroute points on the board, in order (at most 10). It is optional, so no migration is needed. Board only: it never affects a layout. Re-wiring makes a new edge without points.

- D33 Responsive workspace, desktop to phone (owner, 2026-10-20). One app, three layouts:
  - **≥ 1280 px:** the left library and right inspector are docked, with a floating canvas toolbar and a minimap.
  - **768–1279 px:** the sidebars become overlays, one at a time.
  - **< 768 px (phone):** the canvas is full screen, the library and inspector are bottom sheets, and the top bar is condensed into an overflow menu.
  - **Touch:** pinch to zoom, two fingers to pan, long-press for the context menu, tap a port then tap a target to wire, and hit targets of at least 44 px.
  - **Editors on a phone:** the canvas, with the Design panel as a bottom sheet.
- D34 Theme: light and dark with a toggle in the top bar. The default follows the system setting; the choice is remembered per browser. All colours are tokens (DESIGN-SYSTEM.md), so both themes come from one set of rules.
- D35 Node status = layout health. Nodes show how their layout is doing; export progress stays in the export dialog.
  - **Output:** green = fine, amber = warnings (text overflow or below the minimum size, logo clamped, a layer clamped into the safe area), red = errors (missing font or file), grey = frozen (disconnected).
  - **Main preview:** amber for wired layers with no file or text yet.
  - The node shows a dot and a count; the inspector lists each issue and its layer.

## Changes (2026-10-21, owner decisions)
- D36 Editor transform box, Affinity-style (owner; supersedes the react-moveable part of D26). The editors move, resize, rotate and skew layers with our own transform box (`apps/web/src/editor/transform/`, no dependency) instead of react-moveable. Rendering is unchanged: DOM/SVG with one `OutputRenderer` for preview and export.
  - **Handles:** 4 corners scale (proportional for images and logos, Shift toggles), 4 edges, and a rotate handle above the top edge.
  - **Edge handles:** drag outward to stretch; drag along the edge to skew. The opposite edge stays put; Alt pivots on the centre instead; Ctrl/⌘ forces a skew.
  - **Touch:** long-press a handle or the layer (350 ms), then drag — moves included (owner, 2026-10-21: back to the hold, after a short spell of tap-and-drag). On edges, the first 8 px of movement decide stretch or skew. A double-tap resets.
  - **Reset:** a double-click or double-tap on a handle undoes what that handle changed in this editor session. The box keeps each layer's edits as a list of operations; a reset removes that handle's operations and replays the rest, so the layer lands exactly where it would be without them. A fitted picture (D37) also has its own shape (owner, 2026-10-21): a reset of a stretch or scale handle always ends at the picture's proportions, even when the stretch was made before the editor opened (left/right edge: the width from the height; top/bottom: the height from the width; a corner: both, keeping the area); rotation, skew and position stay. A frame changed from outside (typed values, nudges, undo) is the truth: a pure move is recorded, anything else starts a new list.
  - **Snapping:** moves snap to the canvas edges and centre lines and to the other layers' edges and centres, with a guide line. Resizes don't snap.
  - **Model change note:** `Frame.shear?` and `NFrame.shear?` (degrees, CSS `skewX`, applied after `rotation` about the centre, clamped to ±75°). The field is optional, so no migration is needed. It is kept through layout like rotation, stored by placements and overrides (listed as "Skew"), and drawn by the renderer as `rotate(r) skewX(s)`.
- D37 Picture frames hug their visible pixels; stretching distorts (owner, 2026-10-21). An image or SVG layer's frame is the bounding box of the picture's non-transparent pixels, and the picture fills it, stretching with it as in Affinity. Before this, the whole picture, transparent margins included, was fitted inside a default box ("contain").
  - **Trim:** each picture's visible box (`AssetSize.trim`, 0..1) is measured in the browser by drawing it to a canvas of at most 1024 px. The board, browser export and the worker's render page all run the same code (`apps/web/src/render/trim.ts`). Pixels with alpha of 8 or less don't count.
  - **Fitting (`packages/core/src/fit.ts`):** once a picture's trim is known, the board turns every unfitted frame of a picture layer into its visible part as currently drawn, so nothing moves on screen. This covers placements, whole-frame output overrides and frozen frames, including process layers (crop, mirror, turn). It isn't an undo step. Replacing a picture clears its frames' flags, so the new picture is fitted into the old frame. Backgrounds still cover their frame and are never fitted.
  - **Rendering:** a fitted frame draws the picture's visible part (within any process crop) stretched to the frame on each axis; until the trim is measured it draws the old way. The layout engine already keeps picture proportions in outputs, so outputs don't distort.
  - **Model change note:** `Frame.fitted?: true` and `NFrame.fitted?: true`. The field is optional, so no migration is needed. It carries through layout like rotation, is kept by `setPlacement` and `setOverrideFrame`, and is accepted by the API schema.
- D38 Layout v3 — the stretched grid (owner, 2026-10-21; supersedes D30). Outputs looked wrong in tall and wide formats because v2 fitted the layers as one group. Now each layer is placed on its own: the master is a grid that stretches to the output, and every layer stays on its grid coordinate.
  - **Position:** per axis, a layer is pinned by its edge nearest the master edge (centre in the first third → start edge, last third → end edge, middle third → its centre), and that pin lands on the same grid coordinate in the output.
  - **Scale:** a layer that fills the master on both axes (within 0.5% of all edges, e.g. a background picture) covers the output, scaled proportionally. One that spans the master edge to edge on one axis only (a floor strip, a band) stretches with the grid on both axes, so it still spans edge to edge (owner, 2026-10-22; it used to scale proportionally). Every other layer scales with the stretched grid, by `√(sx·sy)` (owner, 2026-10-21: it was `k = min(sx, sy)`, which left layers small in tall and wide outputs): it keeps the share of the canvas it has on the master. The scale is capped so a layer inside the master stays inside the output, and is never below `k`. Except for those edge-to-edge strips, one scale for both axes: pictures and text keep their proportions.
  - **Unchanged:** backgrounds cover; logos keep their minimum width (growing away from their pin); text is fitted inside its box starting at `fontSizePx · scale`; overrides, frozen frames and output-only layers as before.
  - **Dropped:** the side family's left text column and the safe-area clamp. `output.family` is still computed and reported, but no longer changes placement. Spec: `docs/ADAPTATION-RULES.md` v3.
- D39 No limit on layers (owner, 2026-10-21; supersedes the 10-input cap of D7). A master preview takes as many inputs (layers) as the project needs. `LIMITS.maxSources` stays only as a safety ceiling for the API (500), far above real use; the board no longer shows an input count limit. The "Main preview" is renamed **Master preview** in the UI; stored default names ("Main preview", "Main preview N") read "Master preview" on load (`migrateProjectDoc`), names the user typed are kept.
- D40 Assets card: many pictures in one input card (owner, 2026-10-21; owner chose "one Assets node, many layers"). Drop or pick any number of pictures at once on an Assets card — or drop them on the empty canvas to make a card there — and each becomes its own input: its own layer with its own placement, behaviour (subject by default), processes and overrides, wired into the master previews the card feeds (the master preview for a new card). One drop is one undo step; its pictures are laid out in a grid over the middle of the master so they all show, then fitted to their visible pixels (D37).
  - **Board:** the card shows the pictures as thumbnails (click one to set it in the inspector, drag to reorder the card, × deletes one) and draws their wires from its one out port; a wire dragged from the card wires every picture into that master preview. Deleting the card deletes its pictures (one confirm).
  - **Model change note:** `ProjectDoc.stacks?: AssetStack[]` (`{ id, label, board, items }`, input ids in card order). Optional, so no migration is needed. Board only: it never affects a layout. Deleting an input removes it from its card; duplicating one puts the copy right after it.
- D41 Saved transform history (owner, 2026-10-21; PR #87, merged 2026-10-22). The editor's transform history (D36) is saved with the project so the reset controls work after a reload.
  - **Where:** `Composition.transforms?` (master previews) and `OutputNode.transforms?` (outputs), each `{ scene: { width, height }, layers: Record<sourceId, TransformHistory> }`. `TransformHistory` is the editor's `{ origin, ops }` list.
  - **Why the scene size:** history coordinates are the scene's design px. A composition or output size change invalidates them, so histories saved for another size are ignored (and dropped on the next save).
  - **Undo:** a gesture and its history are one undo step; typed values, nudges and undo update the history without adding an extra step.
  - **Model change note:** the fields are optional, so no migration is needed. Editor math now uses the core `TransformOrigin` / `TransformOp` / `TransformHistory` types, so there is one shape on both sides.
  - **Not changed:** asset rendering and the Shift behaviour; no ratio locking or fill mode was added in this change.
- D42 Layout guides (owner, 2026-10-22, "Core Preset Guide"; owner chose "3 guide artboards, auto-pick"). A master preview can have guide artboards — Square, Vertical, Horizontal — each the same design arranged for that shape. Every output of the master takes its layout from whichever of the master and its guides is closest to its own shape (the log of the width/height ratio), then the stretched grid (D38) adapts it to its exact size, so extreme sizes (728×90, 1080×2340) start from the nearest designed shape instead of the square.
  - **Guides:** "Add vertical guide and horizontal guide" in the master's inspector adds the families its own shape isn't (square 1:1, vertical 5:8, horizontal 7:4, at the master's longer side), each seeded from the master through the stretched grid — so nothing changes until a guide is arranged — with the master's rows and wires. Guides are edited in the master preview editor like any composition; "Stop using as a guide" makes one an ordinary master again.
  - **Layers:** the master decides which layers exist and their order; a guide only gives positions. A layer the guide hasn't placed (added after the guide) uses the master's position.
  - **Board:** guide nodes are marked "Guide" with the number of outputs using them; each output's card names the guide it follows.
  - **Model change note:** `Composition.guide?: { of: string; family: 'square' | 'vertical' | 'horizontal' }`. Optional, so no migration is needed; accepted by the API schema.
- D43 Background asset: vertical and horizontal pictures (owner, 2026-10-22, PDF page 3 "Background asset Node"). A background input has, next to its main picture, two optional slots: a picture for vertical outputs and one for horizontal outputs. Each output uses the slot of its shape (the same shape rule as the guides, D42); square outputs, and any output whose slot is empty, use the main picture. A fill background that gets a slot picture takes it as its main photo too (D9).
  - **Engine:** `computeLayout` swaps the picture per output (the cover is computed on that picture) and reports it as `LayoutItem.assetId` → `RenderItem.assetId`; the one renderer draws it. Board thumbnails, browser export and the worker measure and load the slot pictures with the others.
  - **UI:** the background input's inspector, "For vertical and horizontal outputs": two slots (pick or drop a file, replace, clear).
  - **Model change note:** `variants?: { vertical?: string; horizontal?: string }` on image / vector content (asset ids). Optional, so no migration is needed.
- D44 Headline card: Khmer and English (owner, 2026-10-22, PDF page 3 "Headline asset Node"). A Headline card holds the same headline as a Khmer picture and an English picture (PNG, JPEG, WebP or SVG). Each is its own input — its own placement, fit (D37) and output overrides — so each keeps its adjusted transform; "Use: Khmer | English" picks the one every master preview and output draws (the other is skipped as if hidden), and switching swaps every output at once.
  - **Board:** the card shows the two slots (drop or pick a file, replace), the "Use" switch, and one out port; both languages are rows of the master preview; a wire dragged from the card wires both. Click a slot to set that language in the inspector; the inspector also has the switch. Added from the canvas menu ("Headline (Khmer / English)") or the node library. The first picture in a slot starts in the other language's box. Deleting the card deletes both; deleting one language leaves the other an ordinary input.
  - **Model change note:** `ProjectDoc.headlines?: LanguagePair[]` (`{ id, label, board, km, en, use }`). Optional, so no migration is needed; accepted by the API schema.

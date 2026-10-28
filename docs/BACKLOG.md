# BACKLOG (one ticket per session)

Format: `ID — title — acceptance`. Read only `00-READ-FIRST.md`, `DECISIONS.md` and the files named in the ticket.

## P0 Spikes (time-box 1 session each)
- ~~S1 — Affinity 3 `.af` reader check~~ — Dropped (D6). Was: Needs the named-layer test file. Output (never written): `AFFINITY-IMPORT.md` saying what is readable (names, text, rasters, vectors) and go/no-go for T7.6.
- S2 — Khmer text parity — Browser measure + `Intl.Segmenter('km')` gives the same line breaks in Chromium worker as on screen for 5 sample headlines; no clipped diacritics.
- S3 — SVG text outlines — harfbuzzjs + fontkit produces outlined Khmer text that matches the screen render within 1 px.

## P1 Foundation
- T1.1 — Monorepo scaffold — pnpm workspaces (`apps/web|api|worker`, `packages/core|presets`), TS strict, eslint, vitest; `pnpm test` passes.
- T1.2 — DB schema + migrations (Drizzle) — tables per DATA-MODEL header; migration runs on empty Postgres.
- T1.3 — Auth — email+password (argon2id), session cookie, invite links, roles admin/editor/viewer enforced in API.
- T1.4 — Projects API — CRUD, `ProjectDoc` JSONB, `rev` optimistic lock (stale write → 409).
- T1.5 — Asset upload — MinIO, magic-byte check, 50 MB cap, SVG sanitizing, sha256 dedupe, image dimensions stored.
- T1.6 — Docker + Dokploy compose — web, api, worker, postgres, minio; multi-arch build; `.env.example`.
- T1.7 — CI — lint, typecheck, unit tests on push.

## P2 Board and inputs
- T2.1 — Board canvas — `@xyflow/react` v12; node types input/main/output; pan/zoom; autosave to `rev`.
- T2.2 — Input node UI — upload image/SVG, text field, fill picker (solid/gradient).
- T2.3 — Default sources + Add input — 4 defaults on new project; Add dialog (type, name, behavesLike); cap 10; rename/hide/duplicate/delete.
- T2.4 — Ports + wiring — wire input→main creates port; drag-list or re-wire reorders; ports stay contiguous.
- T2.5 — Fonts — bundled Khmer + Latin fonts, upload ttf/otf/woff2, `document.fonts.load` before measuring.

## P3 Main preview
- T3.1 — `OutputRenderer` (DOM/SVG) — renders any frames list; used for main, outputs, thumbnails and `/render`.
- T3.2 — Main editor — place/move/resize/rotate (react-moveable), snap + guides, arrow-key nudge.
- T3.3 — Layers panel — list in port order, visibility toggle, select sync with canvas.
- T3.4 — Text panel — font, size, weight, colour, align, max lines, line height, Khmer/auto language.

## P4 Outputs and engine
- T4.1 — Units — `packages/core` helpers from DATA-MODEL; tests incl. example F.
- T4.2 — Engine: background + fill — example C passes.
- T4.3 — Engine: subject + decoration — examples A, B (subject part) pass.
- T4.4 — Engine: logo — example D passes.
- T4.5 — Engine: text fit + Khmer breaking — example E passes with mock measure; Khmer integration test uses real measure.
- T4.6 — Engine: families — auto stack/side per ratio; side column stacking; clamp warnings.
- T4.7 — Output node UI — size inputs, px/mm toggle, preset picker, bleed/dpi/scale, live thumbnail; export cap warning.
- T4.8 — Presets — model, admin manager, seed (print + social) after verifying sizes (O1).
- T4.9 — Connect rules — wire/disconnect/reconnect per D20/D21; `frozen` snapshot; reconnect dialog.

## P5 Overrides
- T5.1 — Output editor — same tools as main editor, edits write overrides.
- T5.2 — Lock icon + inspector — overridden layers marked; shows which fields differ from auto.
- T5.3 — Reset — per layer and per output; layout returns to auto instantly.
- T5.4 — Override-safe re-flow — master edits never touch overrides (test with 10×10 project).

## P6 Export
- T6.1 — Render route + worker — Playwright Chromium opens `/render/:outputId`, waits for fonts + images.
- T6.2 — PNG/JPG/WebP — pixel size = `exportPixels`; PNG keeps transparency; WebP via sharp.
- T6.3 — PDF — vector, page size in mm incl. bleed; crop marks option (default on when bleed > 0).
- T6.4 — SVG — live text by default, outline text option (needs S3).
- T6.5 — Job queue — pg-boss; progress + errors per output in UI.
- T6.6 — Download — single file and ZIP of all; names `{project}_{output}_{WxH}.{ext}`.
- T6.7 — Caps — block exports over `maxExportEdgePx` with clear message.

## P7 Library and polish
- T7.1 — Team library — save/reuse source across projects (detached copy, keeps `libraryItemId`).
- T7.2 — Undo/redo — board and editors.
- T7.3 — Duplicate project, project templates.
- T7.4 — Performance — 10 inputs × 10 outputs stays smooth; thumbnails throttled/cached.
- T7.5 — E2E tests — create project → 4 inputs → 3 outputs → override → export.
- T7.7 — Team screen — admins invite by link (role, optional email), change roles, remove members, revoke invites; invite page joins a new or signed-in user. (Added: the API from T1.3 had no UI.)
- ~~T7.6 — `.af` importer (experimental)~~ — Dropped (D6). Was: only if S1 says go; one `.af` creates sources from named layers; unreadable layers become empty sources.

## P8 Board UX (user feedback, 2026-10-20)
- T8.1 — Layer list: drag & drop to reorder ports (front ↔ back); each row has only Duplicate (+) and Delete (trash); no ▲ ▼ arrows. (D8, D11)
- T8.2 — Duplicate any input from the canvas (node button and Ctrl/⌘+D), placed next to the original. (D8)
- T8.3 — Drop an image file onto any image/vector/background input to set its file (same validation as the file picker).
- T8.4 — Right-click the empty canvas: add an input (type + behaviour) or an output (preset) at the click point.
- T8.5 — Wires: draw and remove every wire by dragging (input → main port, main → output); drag a wire end away to detach. (D11, D12)
- T8.7 — Behaviours: canvas-menu quick-adds use the natural behaviour (colour → background, image → subject); an input's "behaves like" can be changed on its node (only those its kind allows; a new background goes to the back).
- T8.6 — Main preview editor: move and resize assets directly on the canvas (click to select, drag, handles), easier than today.

## P9 — Smart outputs
- T9.1 — Layout v2 content fit: output elements learn from the main preview but fill each output's free space and re-arrange to it (subjects, decorations and text fitted as a group; side layouts put visuals right and text left). (D30)

## P10 — Figma-style editing
- T10.1 — Editor works like Figma: dark toolbar with Move (V) / Hand (H) tools; pan with Space/H + drag and the wheel; zoom at the pointer (Ctrl/⌘ + wheel), Ctrl/⌘ ±, Shift+1 fit, Shift+0 100%; Design panel with X / Y / W / H / rotation and constrain proportions; size badge on the selection; Shift keeps proportions / snaps rotation to 15°; compact Figma-style layers and panels. Main preview and output editors (shared editor).
- T10.2 — Board design-system pass (`docs/DESIGN-SYSTEM.md`):
  - tokens (colour, type, space, radius, elevation) and white node cards with a type stripe;
  - one field style and one button style; line icons instead of ✎ / 📚 / ×; selects stay inside the card;
  - an output named after its size follows size / preset changes; double-click renames outputs and inputs;
  - a "N edited by hand" chip plus Reset; "layer N" instead of "port N".
- T10.3 — Top bar: three groups — back · project name · undo/redo (icons) | Add input / Add output with count chips | save status dot · Fonts · Library · Export (primary). Compact 48 px, labels collapse to icons on narrow screens.
- T10.4 — Drag a wire out of the main preview and release it on empty canvas: a new output is added there, already wired (D12).

## P11 — Hybrid export (D31)
- T11.1 — Browser export engine: draw an output's `OutputRenderer` DOM to a canvas with fonts and images inlined (SVG `foreignObject`), giving PNG / JPG / WebP up to 4096 px, plus SVG with live text; a feature check (Safari → server).
- T11.2 — (folded into T11.1) Export dialog routing: each file goes to the browser or the server (PDF, outlines, > 4096 px, failed feature check), shows where it is made, retries a failed browser file on the server, and zips several files in the browser.

## P12 — Node graph (D32; retired by D49 / D56)
- T12.1 — Model schema 2, v1 migration, core graph helpers (typed ports, cycle check, effective layers); API upgrades v1; no visible change.
- T12.2 — Board on the typed graph: typed handles, invalid drops refused with a hint, generic re-route / detach.
- ~~T12.3 — Several compositions~~ — retired from the board by D49 (one Layer Comp; its Square / Vertical / Horizontal layouts replace extra master previews).
- ~~T12.4 — Output-only layers~~ — retired from the board by D49 (engine support kept).
- ~~T12.5 — Process nodes I~~ — retired from the board by D49 (renderer support kept).
- ~~T12.6 — Process nodes II~~ — retired from the board by D49.
- ~~T12.7 — Node palette~~ — replaced by D49: a wire out of the Layer Comp group offers the Preset nodes.
- ~~T12.8 — Nested compositions~~ — retired from the board by D49 (engine support kept).

## P13 — Workspace UX (D33, D34, D35)
- T13.1 — Layout health (D35): core `layoutHealth` (level + issues per layer) from the layout result; a status dot + count on output and main nodes; the issue list on hover/tap.
- T13.2 — Right inspector: selection-driven panel; output settings move off the cards (cards keep thumbnail, name, size, status); input content editing too.
- T13.3 — Dark theme + toggle (D34): dark token set, system default, remembered per browser; the board, editors and dialogs.
- ~~T13.4 — Left node library~~ — replaced by D49: "+ Add" and the canvas menu offer the asset nodes and Preset nodes.
- T13.5 — Canvas chrome: floating glass toolbar (select / hand / fit / grid / minimap), minimap, optional 16 px grid snap and alignment guides; wheel pans, Ctrl/⌘ + wheel zooms at the pointer (as in the editor).
- T13.6 — Responsive (D33): tablet overlays, phone bottom sheets and condensed top bar, touch gestures, tap-to-connect, 44 px targets; editors on phones.
- T13.7 — Groups: frame nodes into a named, coloured, collapsible group; export a group.
- T13.8 — Wire polish: wires dim unless related to the selection, a short pulse when a change flows, reroute points.

## P14 — Page-3 board (owner's PDF, 2026-10-21 → 23; D39–D51)
- T14.1 — No layer limit; "Master preview" naming (D39).
- T14.2 — Assets card: many pictures in one card (D40).
- T14.3 — Saved transform history; live numeric fields (D41).
- T14.4 — Layout guides: Square / Vertical / Horizontal (D42).
- T14.5 — Background vertical / horizontal pictures (D43).
- T14.6 — Headline Khmer / English with a Use switch (D44).
- T14.7 — Layer comp group order (D45; draggable D48).
- T14.8 — Preset node: many sizes, one wire in, a Preview each (D46).
- T14.9 — Page-3 board structure: asset nodes (Logo, Headline, Text, Image, Background) → Layer Comp + Core Rule → Preset → Preview; old projects converted (D49).
- T14.10 — Layouts share the master's layers; lock; Core Preset Guide drag-to-assign (D50).
- T14.11 — Preset rows: eye shows / hides a Preview; trash; no ✂ on row wires (D51).

## P15 — After the page-3 board (owner, 2026-10-23: "Start N1-N7 auto"; D52–D54)
- T15.1 (N1) — Inspector speaks the page-3 board: "Layer Comp" with its three layouts, Preview, asset nodes by kind; no "Layout guides".
- T15.2 (N2) — PDF uploads: the first page as a PNG in every picture slot (D52).
- T15.3 (N3) — Several Khmer / English pairs in one Headline node (D53).
- T15.4 (N4) — Preset nodes land clear of other nodes; Tidy board.
- T15.5 (N5) — Preset families as data; Save as team preset (D54).
- T15.6 (N6) — Export from a Preset node: one ZIP named by its family; hidden Previews optional.
- T15.7 (N7) — Resizes snap like moves (axis-aligned layers).
- Reset rule (owner, 2026-10-23): a reset never moves the element; the selection's Reset rotation / Reset transform buttons clear rotation / skew in place (a history-replay version, #115, was reverted in #116).

## P16 — UI polish (owner, 2026-10-23, with screenshots; plan approved "go, templates as cards on top")
- T16.1 — Canvas tools: every toolbar button has a tooltip (name, what it does, shortcut; hover, keyboard focus, long press on touch). Select is the default tool everywhere: click / tap selects, drag moves a panel, a drag on empty canvas (mouse or finger) selects several, and a selection bar offers Group / Delete. Hand moves the board only (panels don't move or get selected). Tidy board gets an "arrange" icon. Wire badges use the owner's scissor icon. Board groups accept every page-3 panel (asset, Headline and Preset nodes were refused).
- T16.2 — Projects screen: templates as cards on top; search and sort; "+ New project" dialog (blank or from a template); a ⋯ menu per project (Open, Open in new tab · Rename, Duplicate · Save as template, Copy link · Delete) and per template; viewers see only the safe items.

## P17 — Dev plan picks (owner, 2026-10-23: "Start M2-M6 auto, skip M1 and M5")
- T17.1 (M2) — Resizes of turned or leaned layers snap too: the moving edges of the drawn bounds land on the guides (the pointer is corrected through both axes; a handle that can land only one line lands the closer).
- T17.2 (M3) — PDF pages kept as vector: the API draws the first page as a sanitized SVG (D55); pixel-only slots and servers without the converter keep the PNG (D52).
- T17.3 (M4) — Size presets dialog: "Preset node families" lists every family (built-in or the team's) with its sizes; admins rename or delete a team family as a whole (a built-in family's name, or another team family's, is refused). Preset nodes already on boards keep their name and sizes.
- T17.4 (M6) — Large exports: over 40 million raster pixels in one multi-file export, every file is made and zipped on the server (the API's streamed ZIP, named by the Preset node's family).

## P18 — The last two picks (owner, 2026-10-23: "Go M1 and M5")
- T18.1 (M1) — Snapping between layouts: in a layout editor or a Preview editor the selected layer also snaps to where it sits in the master's other layouts (relative position; owner picked "Same layer's spot"), with a dashed, labelled outline of each spot while dragging.
- T18.2 (M5) — Retire process nodes, output-only layers, other master previews, compositions as layers and the stored Core Rule node from the model, engine, renderer, API schema and UI; schema 3 with a v2 → v3 migration (D56).

## P19 — Board tools to standard (owner, 2026-10-23: "go ahead" on the interaction-design plan; D57)
- T19.1 — **Done.** Select, Hand and keys: Shift-click / Shift-drag add to the selection, Esc clears, Ctrl/⌘+A selects all; a touch long-press on a panel adds or removes it; holding Space is Hand while held (the toolbar shows it); the Hand cursor; arrow-key nudges saved and undoable (one step per run).
- T19.2 — **Done.** Grid snap and Tidy: grid on → panels land on the 16 px grid and the alignment guides step aside, Alt skips snapping for one move, the dots show the grid's state, the grid button on phones; Tidy arranges the selection (two or more panels) or the board, lands on the grid, glides into place (not with reduced motion), says what it did with Undo, Shift+T.

## P20 — The board on touch screens (owner, 2026-10-23: "go ahead" on the mobile plan; D58)
- T20.1 — **Done.** Move and zoom: one finger moves the board (empty canvas, panels not selected, their buttons); tap selects, a selected panel follows the finger; two fingers pinch and pan anywhere; double-tap zooms in.
- T20.2 — **Done.** Select: long-press opens the menu again (D33); a Select mode on phones (taps add or remove, a drag draws a box; Group, Delete, Done); the phone toolbar shows Select mode, Fit, grid and Tidy.

## P21 — Touch, the rest (owner, 2026-10-24: "Go Q7 and Q8", plan approved "go ahead"; D58)
- T21.1 (Q7) — **Done.** Layout editors on touch like the board: one finger moves the canvas, a tap selects (again for the layer behind), the selected layer and its handles drag at once, two fingers pinch and pan, double-tap empty canvas fits.
- T21.2 (Q8) — **Done.** Small panels on phones: zoomed out below about 50 %, a tap on a panel zooms to it and selects it instead of pressing its controls.

## P22 — Dev plan picks (owner, 2026-10-24: "Go Q1, Q2 and Q5")
- T22.1 (Q1) — **Done.** Multi-page PDFs: pick the page when uploading; the API keeps that page in vector, pixel-only slots get it as a PNG (D59).
- T22.2 (Q2) — **Done.** Preset nodes and team families: after a family is renamed in the Size presets dialog, offer to rename the Preset nodes that came from it, and to add sizes the family gained — as offers on the node when its project is opened (D60).
- T22.3 (Q5) — **Done.** Retire `output.family` (computed but unused for placement since D38): schema 4 with a v3 → v4 migration (D61).

## P23 — Project history (owner, 2026-10-24: "Show me the plan for Q3", plan approved "go ahead"; D62)
- T23.1 (Q3) — **Done.** API: `project_versions`, a version kept on save (every 10 minutes of editing, before inputs or sizes are removed), named versions, restore, retention.
- T23.2 (Q3) — **Done.** History panel on the board: the list by day, a read-only preview with Restore, Save version; in the More menu on phones.

## P24 — Review of Previews (owner, 2026-10-24: "Show me the plan for Q4", plan approved "go ahead"; D63)
- T24.1 (Q4) — **Done.** API and core: `review_comments`, `output_approvals`, comment / reply / resolve / delete rules, approve / withdraw, `previewFingerprint`.
- T24.2 (Q4) — **Done.** Comments on Previews: the Comment tool and pins in the Preview editor, the Comments panel (replies, resolve, edit, delete), the open count on Preview nodes; a tap pins on touch.
- T24.3 (Q4) — **Done.** Approval: Approve / Approve again / Withdraw in the Preview editor, "✓ Approved" and "Changed since approved" on nodes, the Review panel, the export warning and "Only approved".

## P25 — UI refresh (owner, 2026-10-24; D64)
- U1–U7 and U5b — **Done.** Tokens and components, board chrome and readability, editors, Projects home and sign-in, dialogs, copy and accessibility, project thumbnails. Tickets and PRs: `TASKS.md` P25.

## P26 — Asset and pipeline nodes (owner feedback, 2026-10-25; D64)
- V1–V6 — **Done.** Asset nodes and the solid icon set, Layer Comp / Core preset / Preview, phone editors. Tickets and PRs: `TASKS.md` P26.

## P27 — CSS cleanup (plain CSS, one place per style)
- C1–C12 — **Done.** One file per area, no duplicates, a cross-file selector guard. Tickets and PRs: `TASKS.md` P27.

## P28 — Tailwind conversion (owner, 2026-10-26; D65)
- T1–T7 — **Done.** The web app is styled with Tailwind on our tokens; only tokens, base styles, React Flow's DOM and the transform box stay CSS (`docs/FRONTEND.md`). T8 (Preflight, unused `sc-` hooks, retiring the parity test) is optional. Plan: `TAILWIND-PLAN.md`.

## P29 — UX review fixes (owner, 2026-10-27/28: "Go ahead"; D66–D70)
- A1–A7, F8, B1–B10 — **Done.** The fixes from `docs/UX-REVIEW.md`: keyboard reach and focus, field edges, copy, health words, Main Comps and Export Group (D66), "Add sizes", moves without dragging, the Preset node inspector, editor layer rows, Export by Preset node, slot actions (D67), no empty default layers (D68), a board readable at Fit (D69), the phone board (D70). Tickets and PRs: `TASKS.md` P29. C1–C3 wait for the owner.

## P30 — Clean-up review 2 (owner, 2026-10-28)
- The second audit of code, tests, docs and UI: `docs/archive/CLEANUP-AUDIT-2.md`. Group (1) is done; group (2) runs one piece per PR; group (3) waits for the owner's decisions.

## Next — dev plan (proposed 2026-10-23; the owner picks and orders)
- Q9 — Editor colour variables (bug, found by the 2026-10-27 clean-up audit). **Done.** The editor screen redefined `--line` / `--muted` from `--fig-line` / `--fig-muted`, which were defined from them; the loop left both empty, so the editors lost their panel outlines, section dividers, field borders, dropdown chevrons and grey text. `.sc-fig` no longer redefines them (`editor/shell.ts`).
- Q6 — Print colour: CMYK / PDF-X export (D2 left it for v2). **Planned, on hold** (owner, 2026-10-24: "Write this Q6 plan for later. Do not dev it yet."): full plan in `docs/plans/Q6-print-colour.md` — Ghostscript after Chromium in the worker, FOGRA39 / SWOP profiles, three PRs, three open questions for the owner.

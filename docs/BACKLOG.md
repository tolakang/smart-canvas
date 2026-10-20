# BACKLOG (one ticket per session)

Format: `ID — title — acceptance`. Read only `00-READ-FIRST.md`, `DECISIONS.md` and the files named in the ticket.

## P0 Spikes (time-box 1 session each)
- ~~S1 — Affinity 3 `.af` reader check~~ — Dropped (D6). Was: Needs the named-layer test file. Output: `AFFINITY-IMPORT.md` saying what is readable (names, text, rasters, vectors) and go/no-go for T7.6.
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

# BACKLOG (one ticket per session)

Format: `ID — title — acceptance`. Read only `00-READ-FIRST.md`, `DECISIONS.md` and the files named in the ticket.

## P0 Spikes (time-box 1 session each)
- S1 — Affinity 3 `.af` reader check — Needs the named-layer test file. Output: `AFFINITY-IMPORT.md` saying what is readable (names, text, rasters, vectors) and go/no-go for T7.6.
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
- T7.6 — `.af` importer (experimental) — only if S1 says go; one `.af` creates sources from named layers; unreadable layers become empty sources.

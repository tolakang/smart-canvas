# DECISIONS (locked unless marked Open)

## Product
- D1 Team app: login, shared projects, roles admin/editor/viewer.
- D2 Outputs for screen and print. Size per output in px or mm, bleed for print. CMYK / PDF-X are later (v2).
- D3 Khmer + Latin text. Bundle Khmer fonts, allow font upload (ttf/otf/woff2). Word breaks via `Intl.Segmenter('km')`. Same fonts in browser and export worker.
- D4 Subjects are transparent PNG cutouts. Background removal is v2.
- D5 No AI in v1. Rules only.
- D6 Import formats: SVG, PNG, JPG, WebP. Not supported: PSD, AI, PDF, legacy Affinity. No `.af` (Affinity 3) import: dropped by the owner (2026-10-20), too hard to read reliably; export from Affinity to SVG/PNG instead. (S1, T7.6 dropped.)

## Board and inputs
- D7 One main preview per project. Up to 10 input sources (the 4 defaults count) and up to 10 outputs.
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
- D26 Board: `@xyflow/react` v12. **Renderer: DOM/SVG + react-moveable for editing, not react-konva** (changed from earlier chat: identical rendering for preview and export, vector PDF with live text).
- D27 Export: worker drives headless Chromium (Playwright) against a `/render/:outputId` route. PNG/JPG via screenshot, WebP via sharp, PDF via page.pdf. Amended by D31: the worker is now the fallback and the path for PDF / large files.
- D28 Postgres (Drizzle ORM) + MinIO (S3 API) + pg-boss queue (no Redis). Project document stored as JSONB with a revision number (optimistic lock).
- D30 Layout v2 — content fit (2026-10-20, owner's choice after board feedback): subjects, decorations and texts are fitted as a group into the output's safe area (size scale between v1's contain `k` and the master's cover `K`; positions spread per axis to use the space); wide outputs put visuals on the right half and text in a left column, each taking all of the safe area when alone. Backgrounds and logos keep their v1 rules; overrides still win (D18–D21 unchanged). Spec: `docs/ADAPTATION-RULES.md` v2.
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


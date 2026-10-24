# Q6 — Print colour: CMYK / PDF-X export (plan, not started)

Status: **planned, on hold.** Owner, 2026-10-24: "Write this Q6 plan for later. Do not dev it yet." Nothing here is built. Before starting, the owner answers the three questions at the end (or says "go ahead" for the defaults), and a decision D64 records the model change.

## Today
Every PDF is RGB. Chromium prints the render page (`apps/worker/src/pdf.ts`, D23); D2 left CMYK / PDF-X for v2. Printers want **PDF/X**: every colour converted to CMYK for their press, the press's colour profile embedded, and the trim and bleed boxes set.

## What the user gets
- **Export dialog**, format PDF → a new **Colour** choice:
  - **Screen (RGB)** — today's PDF, unchanged.
  - **Print (CMYK, PDF/X)** — converted for a press, with a **Press** list under it.
  - Default: Print for sizes in mm (the print presets), Screen for sizes in px. Either can be changed.
- **Crop marks and bleed** work as today; the PDF also carries TrimBox and BleedBox (PDF/X needs them, printers check them).
- **Black stays black:** pure black text and lines come out as 100 % K only, not four-colour rich black (blurry at small sizes).
- **A note in the dialog:** "Colours shift a little in CMYK, especially bright blues, greens and oranges." No on-screen colour proof in this plan.
- File names get `-cmyk` (`Poster_A4-cmyk.pdf`); Preset node ZIPs work the same way.

## How it works
- **Same renderer, one more step on the server.** Chromium still makes the PDF from the same `OutputRenderer` (no second rendering path). The export worker then passes it through **Ghostscript** (`pdfwrite`, PDF/X output, the chosen output profile, black preserved as K only). CMYK PDFs are always made on the server; the browser can't do this conversion.
- **Colour profiles:** bundle two standard ones — **Coated FOGRA39** (Europe / Asia, what most Cambodian print shops ask for) and **US Web Coated SWOP** (US). Check each profile's licence allows shipping it before bundling; if one can't be shipped, a team uploads its own instead (PR C).
- **Model change (needs D64, CLAUDE.md):** `ExportOptions` gains `color?: 'rgb' | 'cmyk'` and `printProfile?: string`. Both optional, so old export jobs are unchanged. ProjectDoc unchanged. The API validates the new options.
- **New system dependency:** Ghostscript in the worker's Docker image (`mcr.microsoft.com/playwright:*-noble` stage, apt) and in CI (next to poppler-utils). A command-line tool the worker runs; no new npm package. No solid open-source alternative makes PDF/X.
- **Checks in tests:** the PDF declares PDF/X (`GTS_PDFXVersion`) with an output intent naming the profile; no RGB colour in it; Ghostscript's ink-coverage device (`inkcov`) shows a black-text-only page uses K only; TrimBox / BleedBox match the output's trim and bleed.

## PRs
1. **PR A — worker, API, model:** the Ghostscript step, the two profiles, the new export options and their validation, Docker and CI. Tests: a mm output exported as CMYK is PDF/X with no RGB; black text is K only; the boxes match; an RGB export takes exactly today's path.
2. **PR B — export dialog:** Colour and Press, the mm / px defaults, the colour note, the `-cmyk` name. E2E: Print for an A4 preset, export, the downloaded file is a CMYK PDF/X. Docs (DECISIONS D64, BACKLOG / TASKS, HANDOVER, DESIGN-SYSTEM, PRODUCT-SPEC, README; PRODUCT-SPEC's out-of-scope line loses CMYK/PDF-X).
3. **PR C — team press profile (optional):** an admin uploads the print shop's own `.icc` (checked to be a real CMYK output profile: `acsp` signature, colour space `CMYK`, up to 5 MB); it joins the Press list, and the admin sets the team's default press.

## Open questions for the owner
1. **Ghostscript is AGPL.** Running it unmodified as a separate program on our own server is the usual use and doesn't touch our code's licence. If the product is ever sold as software installed on customers' own servers, that needs a closer look. OK to use it?
2. **Default press profile FOGRA39?** Or which one the printers use.
3. **PR C** (the print shop's own profile), or are the two built-in profiles enough for now?

Default if the owner says "go ahead": Ghostscript OK, FOGRA39 by default, no PR C.

## Out of this plan
CMYK JPG / TIFF, spot colours, overprint, on-screen soft proof. Later, if printers ask.

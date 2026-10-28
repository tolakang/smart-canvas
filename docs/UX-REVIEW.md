# UI / UX review (2026-10-27)

A full pass over every screen at main `32cdf87`, after Tailwind T5: Projects home and sign-in, the board and each node, the
inspector, History and Review, both editors and the dialogs, from a new user to a seeded campaign. Light and dark,
desktop, tablet and phone. The page with screenshots and before/after mockups:
https://claude.ai/artifact/9EerLLPtprERQhDNZdV2TK (private; ask the owner).

**Status (2026-10-28):** A1–A7 and B1–B10 are done (#202–#216; decisions D66–D70; `TASKS.md` P29). C1–C3 are on
hold until the owner reviews them. Of the minor findings, F22 (Size presets lists families twice) is still open: the
second clean-up audit (`archive/CLEANUP-AUDIT-2.md`, U15) picks it up.

**How it was checked:** the real app with seeded data (6 Previews in two Preset nodes, an approval, a comment, a Khmer
headline, uploads that wait or fail), about 120 screenshots, an in-page audit on each screen (text contrast, target
sizes, unnamed controls, controls hidden until hover), and a keyboard-only walk of the board. Nielsen's heuristics,
WCAG 2.2 AA and a job map of the main flow. Not covered: a real screen reader, real phones, export file quality.

## Summary

Top problems:

1. A new project doesn't say what comes next: no visible way to add sizes, the Core preset says "Drop a Preview here"
   with none to drop, and Export is disabled with no reason (F3).
2. Keyboard users can't add a picture on the board, and board panels and wires take focus with no ring (F1, F2).
3. Fit makes the board unreadable: 32% desktop, 16% tablet, 19% phone with 6 Previews; buttons of 9–12 px; name tags
   overlap (F4).
4. One idea, many names, and copy that is out of date (F5, F6).
5. Empty default layers ("Subject", "Headline" text) put placeholder boxes in every Preview (F7).

Wins: one calm visual system in both themes (text contrast AA everywhere measured, the React Flow credit link aside);
live Preview thumbnails and project covers; an approval-aware Export that never blocks; a considered touch model;
every control has an accessible name.

## The main job

Master artwork → asset nodes → Layer Comp → sizes → Previews → export. Step by step for a new user: start (clear),
gather assets (fine with a mouse, impossible by keyboard), arrange (works; the layer list doubles every headline),
**pick sizes (where people get lost)**, check every size (unreadable at Fit), approve (clear), export (clear). About 14
interactions to a first export, plus one dead end at the sizes step; B2 and C1 remove most of it.

## Findings

| # | Severity | Screen | Problem | Breaks |
|---|---|---|---|---|
| F1 | Critical | Logo, Image, Headline, Background nodes | Empty slots and "Add or drop pictures" are `<label>`s round a hidden input: not in the Tab order | WCAG 2.1.1, 4.1.2 |
| F2 | Critical | Board | 11 of the first 42 Tab stops (panels, wires) show no focus; five wires come before the first card | WCAG 2.4.7, 2.4.3 |
| F3 | Critical | New project | No path to the sizes step on the board; "Drop a Preview here" with 0 Previews; Export disabled without a reason | H1, H6, blank slate |
| F4 | Major | Board at Fit | 32% / 16% / 19%; "Edit" 21×10 px; tags cover cards and each other; Previews in one tall column | Fitts, H8, WCAG 2.5.8 at the default view |
| F5 | Major | Board, inspector, sign-in, editors | Layer Comp / "Layer comp", Core preset, Preset node / "GDN Preset" / "GDN · 3 sizes" / "Sizes", Preview; sign-in sells "the Layer Comp" | H2, H4 |
| F6 | Major | Inspector, Text node, Preview editor | Headline hint says each language keeps its own position (not since V4); headline picture titled "Logo / SVG", "Behaves like Subject"; Text node's first text named "Headline"; "Reset output"; "Comment"/"Comments" | H2, H4, WCAG 3.3.2 |
| F7 | Major | Preview cards, editors | Empty default layers drawn as "Logo" / "Subject" boxes; badge "○ 2" with no words; health doesn't link to the slot | H8, H1 |
| F8 | Major | Fields, empty tiles, drop areas | Field edges 1.1:1 (fill only); dashed `--line-strong` 1.5:1 | WCAG 1.4.11 |
| F9 | Major | Image / Logo nodes, Core preset | Reorder pictures and move a Preview to another layout are drag-only | WCAG 2.5.7 |
| F10 | Major | Slots, Preset rows, text and pair delete, layer rows | 88 controls hidden until hover (they do show on focus); on phone the tapped empty slot's bar covers its own "+ Add" | H6 |
| F11 | Major | Phone board | One ⋯ menu of 20+ mixed rows; Add only inside it; opens at 19% | Hick, Miller |
| F12 | Major | Inspector | A selected Preset node shows "Nothing selected" | H1, H4 |
| F13 | Major | Both editors | Both languages of every pair and empty layers listed (12 rows for 6 things); ◉ / ○ glyphs for hide | H8, Miller |
| F14 | Minor | New project, PDF page picker | Small-caps titles; every other dialog has a 20 px title | H4 |
| F15 | Minor | Top bar | History, Review (✓), Side panel are icon-only | H6 |
| F16 | Minor | Preset, Preview, Home, History | "disconn…", "1080 × 1080…", "Summer tem…", cut placeholder | H1 |
| F17 | Minor | Inspector | "?" tile; full-width red "Delete node" under the pictures; native radios | H5, H4 |
| F18 | Minor | Preview card | Health list clipped at the card edge; px / mm 22 px and health badge 20 px tall | WCAG 2.5.8 (borderline) |
| F19 | Minor | Board | React Flow credit link: a Tab stop, 52×12 px, 4.3:1 in dark | WCAG 1.4.3, 2.4.3 |
| F20 | Minor | Preset node | Three stacked ways to add a size, the common one last | Hick |
| F21 | Minor | Export dialog | No note about empty layers; ragged rows on phone | H5 |
| F22 | Minor | Size presets | Families listed twice; "Built-in" on every row | H8 |

## Proposals

Effort: S under a day, M 1–3 days, L about a week, XL more.

**(a) Quick polish** — all fit current decisions.

| # | Proposal | Effort | Fixes |
|---|---|---|---|
| A1 | Slots and drop areas as keyboard buttons (Enter / Space opens the picker), accent ring on focus | S | F1 |
| A2 | Focus ring on board panels and wires (`chrome.css`, D65 allows React Flow overrides); wires out of the Tab order | S | F2 |
| A3 | Fields get a 1 px `--line-strong` edge; dashed tiles and drop areas use `--muted` | S | F8 |
| A4 | Copy pass (Headline hint, "Headline picture", "Reset this Preview", stable "Comments", editor title, sign-in) | S | F6 |
| A5 | Unified dialog titles; no truncation of status and size | S | F14, F16 |
| A6 | Health badge with words; health list inside the card | S | F7, F18 |
| A7 | Inspector: icon for "?", quiet Delete row, segmented switch; credit link out of the Tab order | S | F17, F19 |

**(b) Medium changes**

| # | Proposal | Effort | Fixes | Decision |
|---|---|---|---|---|
| B1 | Rename Layer Comp → **Main Comps**, Core preset → **Export Group** everywhere; Preset titles = the family | M | F5 | changes D64 (U7 words, V2 name) |
| B2 | "Add sizes" empty state in the Export Group (family chips, Custom size); Export explains "Add sizes first" | M | F3 | fits |
| B3 | Previews in 2–3 column grids per Preset node; Fit floor 40% plus "Fit all"; zoom to a panel picked from Review / Enter; tags that never overlap | M–L | F4 | changes D57 (Tidy grid), N4 |
| B4 | "Move to ▸ Square / Vertical / Horizontal" on Preview chips; "Move left / right" for pictures | S–M | F9 | fits |
| B5 | Editor layers: one row per headline pair with KM / EN; folded empty layers; icon set for hide | M | F13 | fits |
| B6 | Preset node inspector; one "Add a size" menu on the card; Save as team preset in ⋯ | M | F12, F20 | fits |
| B7 | Phone: Add in the bottom toolbar, a sectioned Add sheet, a shorter ⋯, open zoomed to the assets | M | F11 | changes D58 (phone toolbar) |
| B8 | Slot actions that don't collide: an empty slot shows only Delete; on touch the bar sits under the tile | S–M | F10 | changes D64 (V1) |
| B9 | Export dialog grouped by Preset node, with a note about empty layers | S–M | F21 | fits |
| B10 | No empty default slots in new projects; first text "Text 1"; no placeholders in board Previews | M | F7, F6 | changes D8, D49 |

**(c) Bigger rethinks**

| # | Proposal | Effort | Decision |
|---|---|---|---|
| C1 | Guided start: New project asks for size families and takes the artwork files; a progress strip until the first export | L | changes D49 |
| C2 | Pipeline lanes on the board: Assets → Main Comps → Export Groups | XL | changes D57, D49 |
| C3 | Merge the Core preset into each Export Group (a Layout column on each size row) | L | changes D64 (V2), D50 |

## Accessibility (WCAG 2.2 AA)

Passes everywhere: text contrast (1.4.3, the React Flow credit aside), names (4.1.2), focus inside cards, dialogs and
editors. Fails: 2.1.1 on the asset nodes (F1), 2.4.7 on board panels and wires (F2), 1.4.11 on fields and empty tiles in
both themes (F8), 2.5.7 for picture reorder and moving a Preview between layouts (F9). 2.5.8 fails only at the default
Fit zoom (F4); at 100% only the px / mm toggle and the health badge are under 24 px. Hover-only actions all show on focus
and on tap, so 1.4.13 passes; discoverability is F10. The per-screen table is on the review page.

## Suggested PR order

Tailwind T6 and T7 go before the UI PRs that touch their areas, so new UI there is written in utilities from the start.

1. A1, A2, A7 (credit link): keyboard reach and focus rings
2. A3: field and tile edges
3. A4, A5: copy, dialog titles, truncation
4. B1: Main Comps and Export Group (needs D64)
5. B2: "Add sizes" empty state
6. A6, A7: health badge words, inspector clean-up
7. B4: non-drag alternatives
8. B6: Preset node inspector, one "Add a size"
9. — Tailwind T7 (editors) — then B5: editor layer list
10. — Tailwind T6 (review) — then B9: Export dialog grouping
11. B10: no empty default layers (needs D8, D49)
12. B8: slot actions (needs D64 V1)
13. B3: readable board (needs D57)
14. B7: phone Add (needs D58)
15. C1, C2, C3 as decided

PRs 1–3 need no decision and fix every WCAG fail except dragging (PR 7): about two days.

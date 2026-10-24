# TASKS

Status tracker for `docs/BACKLOG.md`. Acceptance criteria live there; this file only tracks progress.
One ticket per session. Tick a box when its PR is merged and add the PR link.

Legend: `[x]` done · `[ ]` to do

**Next:** P1–P18 are done. Proposed next work is BACKLOG **Next** (Q1–Q6), to be chosen by the owner. Retired: T12.3–T12.8 and T13.4 (D49 board, D56 model and engine).

## P0 Spikes (time-box 1 session each)
- [~] ~~S1 — Affinity 3 `.af` reader check~~ — dropped (D6)
- [x] S2 — Khmer text parity — pass — [#44](https://github.com/tolakang/smart-canvas/pull/44)
- [x] S3 — SVG text outlines — pass — [#45](https://github.com/tolakang/smart-canvas/pull/45)

## P1 Foundation
- [x] T1.1 — Monorepo scaffold — [#1](https://github.com/tolakang/smart-canvas/pull/1)
- [x] T1.2 — DB schema + migrations (Drizzle) — [#3](https://github.com/tolakang/smart-canvas/pull/3)
- [x] T1.3 — Auth — [#5](https://github.com/tolakang/smart-canvas/pull/5)
- [x] T1.4 — Projects API — [#6](https://github.com/tolakang/smart-canvas/pull/6)
- [x] T1.5 — Asset upload — [#7](https://github.com/tolakang/smart-canvas/pull/7)
- [x] T1.6 — Docker + Dokploy compose — [#8](https://github.com/tolakang/smart-canvas/pull/8)
- [x] T1.7 — CI — [#9](https://github.com/tolakang/smart-canvas/pull/9)

## P2 Board and inputs
- [x] T2.1 — Board canvas — [#10](https://github.com/tolakang/smart-canvas/pull/10)
- [x] T2.2 — Input node UI — [#11](https://github.com/tolakang/smart-canvas/pull/11)
- [x] T2.3 — Default sources + Add input — [#12](https://github.com/tolakang/smart-canvas/pull/12)
- [x] T2.4 — Ports + wiring — [#13](https://github.com/tolakang/smart-canvas/pull/13)
- [x] T2.5 — Fonts — [#14](https://github.com/tolakang/smart-canvas/pull/14)

## P3 Main preview
- [x] T3.1 — `OutputRenderer` (DOM/SVG) — [#15](https://github.com/tolakang/smart-canvas/pull/15)
- [x] T3.2 — Main editor — [#16](https://github.com/tolakang/smart-canvas/pull/16)
- [x] T3.3 — Layers panel — [#17](https://github.com/tolakang/smart-canvas/pull/17)
- [x] T3.4 — Text panel — [#18](https://github.com/tolakang/smart-canvas/pull/18)

## P4 Outputs and engine
- [x] T4.1 — Units — [#19](https://github.com/tolakang/smart-canvas/pull/19)
- [x] T4.2 — Engine: background + fill — [#20](https://github.com/tolakang/smart-canvas/pull/20)
- [x] T4.3 — Engine: subject + decoration — [#21](https://github.com/tolakang/smart-canvas/pull/21)
- [x] T4.4 — Engine: logo — [#22](https://github.com/tolakang/smart-canvas/pull/22)
- [x] T4.5 — Engine: text fit + Khmer breaking — [#23](https://github.com/tolakang/smart-canvas/pull/23)
- [x] T4.6 — Engine: families — [#24](https://github.com/tolakang/smart-canvas/pull/24)
- [x] T4.7 — Output node UI — [#25](https://github.com/tolakang/smart-canvas/pull/25)
- [x] T4.8 — Presets — [#26](https://github.com/tolakang/smart-canvas/pull/26)
- [x] T4.9 — Connect rules — [#27](https://github.com/tolakang/smart-canvas/pull/27)

## P5 Overrides
- [x] T5.1 — Output editor — [#28](https://github.com/tolakang/smart-canvas/pull/28)
- [x] T5.2 — Lock icon + inspector — [#29](https://github.com/tolakang/smart-canvas/pull/29)
- [x] T5.3 — Reset — [#30](https://github.com/tolakang/smart-canvas/pull/30)
- [x] T5.4 — Override-safe re-flow — [#31](https://github.com/tolakang/smart-canvas/pull/31)

## P6 Export
- [x] T6.1 — Render route + worker — [#32](https://github.com/tolakang/smart-canvas/pull/32)
- [x] T6.2 — PNG/JPG/WebP — [#33](https://github.com/tolakang/smart-canvas/pull/33)
- [x] T6.3 — PDF — [#34](https://github.com/tolakang/smart-canvas/pull/34)
- [x] T6.4 — SVG — live text [#35](https://github.com/tolakang/smart-canvas/pull/35); outline text [#46](https://github.com/tolakang/smart-canvas/pull/46)
- [x] T6.5 — Job queue — [#36](https://github.com/tolakang/smart-canvas/pull/36)
- [x] T6.6 — Download — [#37](https://github.com/tolakang/smart-canvas/pull/37)
- [x] T6.7 — Caps — [#38](https://github.com/tolakang/smart-canvas/pull/38)

## P7 Library and polish
- [x] T7.1 — Team library — [#39](https://github.com/tolakang/smart-canvas/pull/39)
- [x] T7.2 — Undo/redo — [#40](https://github.com/tolakang/smart-canvas/pull/40)
- [x] T7.3 — Duplicate project, project templates — [#41](https://github.com/tolakang/smart-canvas/pull/41)
- [x] T7.4 — Performance — [#42](https://github.com/tolakang/smart-canvas/pull/42)
- [x] T7.5 — E2E tests — [#43](https://github.com/tolakang/smart-canvas/pull/43)
- [~] ~~T7.6 — `.af` importer (experimental)~~ — dropped (D6)
- [x] T7.7 — Team screen (invite links, roles) — [#47](https://github.com/tolakang/smart-canvas/pull/47)

## P8 Board UX (user feedback)
- [x] T8.1 — Layer list: drag & drop reorder, Duplicate + Delete only — [#48](https://github.com/tolakang/smart-canvas/pull/48)
- [x] T8.2 — Duplicate any input from the canvas — [#49](https://github.com/tolakang/smart-canvas/pull/49)
- [x] T8.3 — Drop an image file onto an input — [#50](https://github.com/tolakang/smart-canvas/pull/50)
- [x] T8.4 — Right-click canvas: add input / output — [#51](https://github.com/tolakang/smart-canvas/pull/51)
- [x] T8.5 — Wires: attach and detach by dragging — [#52](https://github.com/tolakang/smart-canvas/pull/52)
- [x] T8.6 — Main preview editor: easier move / resize — [#53](https://github.com/tolakang/smart-canvas/pull/53)
- [x] T8.7 — Behaviours: right quick-add defaults; change "behaves like" on the node — [#54](https://github.com/tolakang/smart-canvas/pull/54)

## P9 — Smart outputs
- [x] T9.1 — Layout v2: outputs fill the space and re-arrange (D30) — [#55](https://github.com/tolakang/smart-canvas/pull/55)

## P10 — Figma-style editing
- [x] T10.1 — Editor like Figma: tools, pan / zoom, Design panel, Figma look — [#56](https://github.com/tolakang/smart-canvas/pull/56)
- [x] T10.2 — Board design-system pass: tokens, node cards, fields, icons, output naming — [#58](https://github.com/tolakang/smart-canvas/pull/58)
- [x] T10.3 — Top bar redesign — [#59](https://github.com/tolakang/smart-canvas/pull/59)
- [x] T10.4 — Drag a wire out of main onto the canvas → new wired output — [#60](https://github.com/tolakang/smart-canvas/pull/60)

## P11 — Hybrid export (D31)
- [x] T11.1 — Hybrid export: browser engine, routing, server fallback, browser ZIP — [#62](https://github.com/tolakang/smart-canvas/pull/62)
- [~] T11.2 — folded into T11.1

## P12 — Node graph (D32)
- [x] T12.1 — Model schema 2 + migration + core graph helpers — [#63](https://github.com/tolakang/smart-canvas/pull/63)
- [x] T12.2 — Board on the typed graph — [#66](https://github.com/tolakang/smart-canvas/pull/66)
- [x] T12.3 — Several compositions — [#69](https://github.com/tolakang/smart-canvas/pull/69)
- [x] T12.4 — Output-only layers — [#73](https://github.com/tolakang/smart-canvas/pull/73)
- [x] T12.5 — Process nodes I: Crop, Adjust, Flip/Rotate — [#74](https://github.com/tolakang/smart-canvas/pull/74)
- [x] T12.6 — Process nodes II: Text variant, Recolor — [#75](https://github.com/tolakang/smart-canvas/pull/75)
- [x] T12.7 — Node palette from any port — [#76](https://github.com/tolakang/smart-canvas/pull/76)
- [x] T12.8 — Nested compositions — [#77](https://github.com/tolakang/smart-canvas/pull/77)

## P13 — Workspace UX (D33–D35)
- [x] T13.1 — Layout health status on nodes — [#65](https://github.com/tolakang/smart-canvas/pull/65)
- [x] T13.2 — Right inspector (settings off the cards) — [#67](https://github.com/tolakang/smart-canvas/pull/67)
- [x] T13.3 — Dark theme + toggle — [#68](https://github.com/tolakang/smart-canvas/pull/68)
- [x] T13.4 — Left node library — [#70](https://github.com/tolakang/smart-canvas/pull/70)
- [x] T13.5 — Floating toolbar, minimap, grid snap, guides — [#71](https://github.com/tolakang/smart-canvas/pull/71)
- [x] T13.6 — Responsive: tablet + phone, touch — [#72](https://github.com/tolakang/smart-canvas/pull/72)
- [x] T13.7 — Groups — [#78](https://github.com/tolakang/smart-canvas/pull/78)
- [x] T13.8 — Wire polish — [#79](https://github.com/tolakang/smart-canvas/pull/79)

## P14 — Page-3 board (D39–D51)
- [x] T14.1 — No layer limit; "Master preview" (D39) — [#92](https://github.com/tolakang/smart-canvas/pull/92)
- [x] T14.2 — Assets card (D40) — [#93](https://github.com/tolakang/smart-canvas/pull/93)
- [x] T14.3 — Saved transform history (D41) — [#87](https://github.com/tolakang/smart-canvas/pull/87)
- [x] T14.4 — Layout guides (D42) — [#98](https://github.com/tolakang/smart-canvas/pull/98)
- [x] T14.5 — Background V/H (D43) — [#99](https://github.com/tolakang/smart-canvas/pull/99)
- [x] T14.6 — Headline KH/EN (D44) — [#100](https://github.com/tolakang/smart-canvas/pull/100)
- [x] T14.7 — Layer comp order (D45, D48) — [#101](https://github.com/tolakang/smart-canvas/pull/101), [#104](https://github.com/tolakang/smart-canvas/pull/104)
- [x] T14.8 — Preset node (D46) — [#102](https://github.com/tolakang/smart-canvas/pull/102)
- [x] T14.9 — Page-3 board structure (D49; D47 superseded, [#103](https://github.com/tolakang/smart-canvas/pull/103)) — [#104](https://github.com/tolakang/smart-canvas/pull/104)
- [x] T14.10 — Shared layouts, lock, drag-to-assign (D50) — [#105](https://github.com/tolakang/smart-canvas/pull/105)
- [x] T14.11 — Preset row eye / trash (D51) — [#106](https://github.com/tolakang/smart-canvas/pull/106)
- Also merged: layout v3 (#90, #91, #97), editor fixes (#94, #95), JPG 4:4:4 + "edited" tag (#96).

## P15 After the page-3 board (N1–N7)
- [x] T15.1 (N1) — Inspector clean-up — [#108](https://github.com/tolakang/smart-canvas/pull/108)
- [x] T15.2 (N2) — PDF uploads (D52) — [#109](https://github.com/tolakang/smart-canvas/pull/109)
- [x] T15.3 (N3) — Several KH/EN pairs per Headline node (D53) — [#110](https://github.com/tolakang/smart-canvas/pull/110)
- [x] T15.4 (N4) — Preset placement / Tidy board — [#111](https://github.com/tolakang/smart-canvas/pull/111)
- [x] T15.5 (N5) — Preset families as data (D54) — [#112](https://github.com/tolakang/smart-canvas/pull/112)
- [x] T15.6 (N6) — Export from a Preset node — [#113](https://github.com/tolakang/smart-canvas/pull/113)
- [x] T15.7 (N7) — Resize snapping — [#114](https://github.com/tolakang/smart-canvas/pull/114)
- Reset buttons: history replay tried in #115, reverted in #116 (owner: the in-place reset was right).
- Clean-up of code the page-3 board no longer reaches, and of these docs — [#117](https://github.com/tolakang/smart-canvas/pull/117)

## P16 UI polish
- [x] T16.1 — Canvas tools: tooltips, Select / Hand, selection bar, Tidy icon, scissor badge, groups of page-3 panels — [#118](https://github.com/tolakang/smart-canvas/pull/118)
- [x] T16.2 — Projects screen: template cards, ⋯ menus, search / sort, New project dialog, rename — [#119](https://github.com/tolakang/smart-canvas/pull/119)

## P17 Dev plan picks (M2, M3, M4, M6)
- [x] T17.1 (M2) — Resize snapping for turned / leaned layers — [#120](https://github.com/tolakang/smart-canvas/pull/120)
- [x] T17.2 (M3) — PDF pages kept as vector (D55) — [#121](https://github.com/tolakang/smart-canvas/pull/121)
- [x] T17.3 (M4) — Preset families in the Size presets dialog — [#122](https://github.com/tolakang/smart-canvas/pull/122)
- [x] T17.4 (M6) — Large exports made and zipped on the server — [#123](https://github.com/tolakang/smart-canvas/pull/123)

## P18 The last two picks (M1, M5)
- [x] T18.1 (M1) — Snap to the layer's spot in the other layouts — [#124](https://github.com/tolakang/smart-canvas/pull/124)
- [x] T18.2 (M5) — Retire engine features the board no longer offers, schema 3 (D56) — [#125](https://github.com/tolakang/smart-canvas/pull/125)

## P19 Board tools to standard (D57)
- [x] T19.1 — Select, Hand and keys — [#127](https://github.com/tolakang/smart-canvas/pull/127)
- [x] T19.2 — Grid snap and Tidy — [#128](https://github.com/tolakang/smart-canvas/pull/128); its e2e test always exercises Tidy selection and Undo — [#129](https://github.com/tolakang/smart-canvas/pull/129)

## P20 The board on touch screens (D58)
- [x] T20.1 — Move and zoom: one finger moves the board, a selected panel follows the finger, two fingers pinch anywhere
- [x] T20.2 — Select: long-press menu again, Select several on touch

## Next (see BACKLOG; proposals, the owner picks)
- [ ] Q1 — Pick the page of a multi-page PDF
- [ ] Q2 — Preset nodes follow a renamed team family
- [ ] Q3 — Project history: see and restore earlier saves
- [ ] Q4 — Review: comments and approval on Previews
- [ ] Q5 — Retire `output.family` (computed, unused since D38; model change)
- [ ] Q6 — Print colour: CMYK / PDF-X export (v2, D2)

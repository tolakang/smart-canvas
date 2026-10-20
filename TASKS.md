# TASKS

Status tracker for `docs/BACKLOG.md`. Acceptance criteria live there; this file only tracks progress.
One ticket per session. Tick a box when its PR is merged and add the PR link.

Legend: `[x]` done · `[ ]` to do

**Next:** order — T13.1 health → T12.2 typed ports → T13.2 inspector → T13.3 dark theme → T12.3 compositions → T13.4 library → T13.5 canvas chrome → T13.6 responsive → T12.4–T12.8 → T13.7 groups → T13.8 wire polish

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
- [ ] T12.3 — Several compositions
- [ ] T12.4 — Output-only layers
- [ ] T12.5 — Process nodes I: Crop, Adjust, Flip/Rotate
- [ ] T12.6 — Process nodes II: Text variant, Recolor
- [ ] T12.7 — Node palette from any port
- [ ] T12.8 — Nested compositions

## P13 — Workspace UX (D33–D35)
- [x] T13.1 — Layout health status on nodes — [#65](https://github.com/tolakang/smart-canvas/pull/65)
- [ ] T13.2 — Right inspector (settings off the cards)
- [ ] T13.3 — Dark theme + toggle
- [ ] T13.4 — Left node library
- [ ] T13.5 — Floating toolbar, minimap, grid snap, guides
- [ ] T13.6 — Responsive: tablet + phone, touch
- [ ] T13.7 — Groups
- [ ] T13.8 — Wire polish

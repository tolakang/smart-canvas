# TASKS

Status tracker for `docs/BACKLOG.md`. Acceptance criteria live there; this file only tracks progress.
One ticket per session. Tick a box when its PR is merged and add the PR link.

Legend: `[x]` done · `[ ]` to do

**Next:** S1 — needs the Affinity `.af` test file with named layers; then T7.6 if S1 says go

## P0 Spikes (time-box 1 session each)
- [ ] S1 — Affinity 3 `.af` reader check
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
- [ ] T7.6 — `.af` importer (experimental) — needs S1 go

# Artwork Adaptation App — READ FIRST

One master artwork → many sizes. The board (D49, the owner's page-3 design) wires **asset nodes** (Logo, Headline KH/EN, Text, Image, Background V/H) → the **Layer Comp + Core Rule** group (the master, with Square / Vertical / Horizontal layouts) → **Preset nodes** (a family of sizes) → one **Preview** per size.
Rules-based auto-adapt (no AI in v1), manual overrides are kept, export PNG/JPG/WebP/SVG/PDF (single or ZIP).
Team app (login), deployed on Dokploy. Khmer + Latin text.

## Which file to read
| Task | Read |
|---|---|
| Any task | `DECISIONS.md` — do not re-decide locked items |
| What to build / flows / screens | `PRODUCT-SPEC.md` |
| Types, DB shape, unit math | `DATA-MODEL.ts` (copy as-is into `packages/core/src/model.ts`) |
| Layout math, text fitting, examples/tests | `ADAPTATION-RULES.md` |
| What to do next | `BACKLOG.md` (one ticket per session; proposed **Next** at the end) |
| Where things are now, how the owner works | `HANDOVER.md` (read after this file) |
| Repo conventions, commands | `CLAUDE.md` (goes in repo root) |

## Working rules
1. One backlog ticket per session. Read only the files the ticket needs.
2. Locked decisions (`DECISIONS.md` §Locked) are not reopened. If something conflicts, stop and ask.
3. Layout engine lives in `packages/core`, is pure and deterministic, and is covered by the worked examples in `ADAPTATION-RULES.md` as unit tests.
4. Preview and export use the same renderer (`OutputRenderer`). Never fork rendering logic.
5. Only overrides are stored; layout is always recomputed.

## Status
Spec v1.0 (2026-10-19); board redesigned 2026-10-22/23 (D48–D51). Open items with defaults: `DECISIONS.md` §Open.
Also: DESIGN-SYSTEM.md (UI tokens and components), NODE-GRAPH.md (D32; the engine's graph — the board now shows only the page-3 structure). Not yet written: ARCHITECTURE.md, API-SPEC.yaml, UI-WIREFRAMES.html, PRESETS.json, KHMER-TEXT.md, deploy templates.

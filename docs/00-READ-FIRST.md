# Artwork Adaptation App — READ FIRST

One master artwork → many sizes. A flow board wires **Input sources → Main preview → Output nodes**.
Rules-based auto-adapt (no AI in v1), manual overrides are kept, export PNG/JPG/WebP/SVG/PDF (single or ZIP).
Team app (login), deployed on Dokploy. Khmer + Latin text.

## Which file to read
| Task | Read |
|---|---|
| Any task | `DECISIONS.md` — do not re-decide locked items |
| What to build / flows / screens | `PRODUCT-SPEC.md` |
| Types, DB shape, unit math | `DATA-MODEL.ts` (copy as-is into `packages/core/src/model.ts`) |
| Layout math, text fitting, examples/tests | `ADAPTATION-RULES.md` |
| What to do next | `BACKLOG.md` (one ticket per session) |
| Repo conventions, commands | `CLAUDE.md` (goes in repo root) |

## Working rules
1. One backlog ticket per session. Read only the files the ticket needs.
2. Locked decisions (`DECISIONS.md` §Locked) are not reopened. If something conflicts, stop and ask.
3. Layout engine lives in `packages/core`, is pure and deterministic, and is covered by the worked examples in `ADAPTATION-RULES.md` as unit tests.
4. Preview and export use the same renderer (`OutputRenderer`). Never fork rendering logic.
5. Only overrides are stored; layout is always recomputed.

## Status
Spec v1.0 (2026-10-19). Open items with defaults: `DECISIONS.md` §Open.
Not yet written: ARCHITECTURE.md, API-SPEC.yaml, UI-WIREFRAMES.html, PRESETS.json, KHMER-TEXT.md, AFFINITY-IMPORT.md, deploy templates.

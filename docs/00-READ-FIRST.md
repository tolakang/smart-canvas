# Artwork Adaptation App — READ FIRST

One master artwork → many sizes. The board (D49, the owner's page-3 design) wires **asset nodes** (Logo, Headline KH/EN, Text, Image, Background V/H) → the **Layer Comp + Core preset** group (the master, with Square / Vertical / Horizontal layouts) → **Preset nodes** (a family of sizes) → one **Preview** per size.
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
| Any UI or styling work | `STYLING.md` (Tailwind on our tokens, D65) and `DESIGN-SYSTEM.md` (the tokens) |
| Repo conventions, commands | `CLAUDE.md` (goes in repo root) |

## Working rules
1. One backlog ticket per session. Read only the files the ticket needs.
2. Locked decisions (`DECISIONS.md` §Locked) are not reopened. If something conflicts, stop and ask.
3. Layout engine lives in `packages/core`, is pure and deterministic, and is covered by the worked examples in `ADAPTATION-RULES.md` as unit tests.
4. Preview and export use the same renderer (`OutputRenderer`). Never fork rendering logic.
5. Only overrides are stored; layout is always recomputed.

## Status
Spec v1.0 (2026-10-19); board redesigned 2026-10-22/23 (D48–D51); PDF uploads, several Headline pairs and preset families as data added 2026-10-23 (D52–D54); PDF pages kept as vector (D55); unused engine features retired, schema 3 (D56); board tools (Select, Hand, keys, grid snap, Tidy) to the standard of design tools (D57); the board on touch screens like the design apps' phone versions (D58); a PDF of several pages asks which page (D59); Preset nodes follow their team family (D60); `output.family` retired, schema 4 (D61); versions and review (D62, D63); the UI refresh (D64); the web app styled with Tailwind on our tokens (D65, 2026-10-26; conversion `../TAILWIND-PLAN.md`). Open items with defaults: `DECISIONS.md` §Open. Where things stand and what's next: `HANDOVER.md`, `BACKLOG.md` **Next**.
Also: DESIGN-SYSTEM.md (UI tokens and components), STYLING.md (how to write the UI's classes), DEPLOY-DOKPLOY.md (deploy), spikes/ (S2 Khmer parity, S3 SVG outlines), plans/ (plans written for later; Q6 print colour, on hold). Built-in size presets live in `packages/presets`.

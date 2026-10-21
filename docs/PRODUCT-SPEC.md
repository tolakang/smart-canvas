# PRODUCT-SPEC (v1)

## Concepts
- **Input source**: one piece of content (background, subject, headline, logo, any added). Has kind, behaviour, content, port.
- **Master preview**: the master artwork. Sources are placed on it (normalized frames). Single source of truth.
- **Output node**: one target size with its own live preview/editor. Wired to main; can be disconnected.
- **Override**: a manual change on an output; survives master changes.
- **Preset / Library**: team-wide size presets (print, social) and reusable sources.

## Screens
1. Login / accept invite
2. Projects list (team)
3. **Board** (main screen): input nodes left, master preview centre, output nodes right, wires between. Inspector side panel. Toolbar: Add input, Add output, Export, Library.
4. Master preview editor (open from the main node): place/move/resize/rotate, snap and guides, layers panel, text panel.
5. Output editor (open from an output node): same tools, shows lock icons on overridden layers, "Reset layer" and "Reset output".
6. Library panel (team assets: logos, fills, text presets, fonts)
7. Preset manager (admin)
8. Export dialog (formats, scale/dpi, crop marks, outline text, all or selected)
9. Team settings (members, roles, invite links)

## Flows
1. **Start**: create project → 4 default inputs and an empty master preview (3000×3000 px) appear.
2. **Fill inputs**: upload/type content per input; pick or change behaviour; add more inputs (max 10).
3. **Compose master**: sources auto-placed by behaviour on first wire; user adjusts in main editor.
4. **Add output**: pick preset or type size (px/mm); node appears wired to main with live preview.
5. **Adjust output**: open editor, move/resize/restyle layers → stored as overrides (lock icon).
6. **Change master or an input**: all connected outputs re-flow; overridden layers keep their override.
7. **Disconnect / reconnect**: frozen while disconnected; on reconnect, silent re-sync if no overrides, else ask (keep / reset all / cancel).
8. **Export**: single output or all (ZIP); progress shown; files named `{project}_{output}_{WxH}.{ext}`.

## Features and acceptance (short; details in BACKLOG)
| ID | Feature | Done when |
|---|---|---|
| F1 | Input sources incl. 4 defaults, add up to 10, behaviours | Add/rename/hide/duplicate/delete work; cap enforced |
| F2 | Master preview with port order = z-order | Re-wire or drag changes stacking everywhere |
| F3 | Outputs with presets, px/mm, bleed, resolution | Size change re-flows preview instantly |
| F4 | Auto adaptation (rules) | Worked examples in ADAPTATION-RULES pass as unit tests |
| F5 | Manual override + lock + reset | Edit persists across master edits; reset restores auto |
| F6 | Wire/disconnect/reconnect rules | D20/D21 behave exactly |
| F7 | Export single/all, 5 formats | Output pixel size matches spec; Khmer text identical to preview |
| F8 | Team library | Save/reuse source across projects |
| F9 | Auth and roles | viewer read-only; editor edits; admin manages presets and members |
| F10 | Khmer text | Word-safe line breaks; no clipped diacritics; fonts identical in export |

## Non-functional
- 10 inputs × 10 outputs stays responsive (previews throttled, thumbnails cached).
- Autosave with optimistic revision; conflict shows "reload latest".
- Uploads validated by magic bytes; SVG sanitized (no scripts, no external refs).
- Export worker runs one job per output; failures reported per output.

## Out of scope for v1
AI layout, background removal, CMYK/PDF-X, PSD/AI/PDF import, real-time multi-user editing, Google/Telegram login, direct `.af` import (experimental later ticket).

# PRODUCT-SPEC (v1)

## Concepts (board as of D49–D70)
- **Asset nodes**: Logo (one or more logos), Headline (one or more Khmer / English picture pairs, one language in use), Text (text slots, each its own layer), Image (many pictures), Background (vertical and horizontal pictures, or a colour). Each holds items you add, replace or delete; pictures are PNG, JPEG, WebP or SVG, or a PDF's chosen page (D59; kept as vector, D55; as a PNG in pixel-only slots).
- **Main Comps** (the master; named Layer Comp before D66): the layer order as four groups (logo, headline, elements, background; drag to re-order) and three layouts — Square, Vertical, Horizontal — that share the layers but place them each their own way.
- **Export Group** (named Core preset before D66): which layout each Preview uses — sorted by shape on its own, dragged into another section by hand (V2: the per-layer layout rules work behind the scenes and are not shown).
- **Preset node**: a family of sizes (FB, IG, Story, GDN, App banner, Website, Gift, PR, a team family, or custom); one row per size, each wired to its **Preview** (shown or hidden with the row's eye). Export makes one ZIP of its sizes; Save as team preset makes it a team family.
- **Preview** (an output): one target size, laid out automatically from the closest (or chosen) layout; Edit stores overrides; Export.
- **Override**: a manual change on a Preview; survives master changes.
- **Preset / Library**: team-wide size presets and reusable sources.

## Screens
1. Login / accept invite
2. Projects (team): templates as cards on top ("Start from a template"), the projects with search and sort, a ⋯ menu per project (Open, Open in new tab · Rename, Duplicate · Save as template, Copy link · Delete) and per template, "+ New project" (blank or from a template)
3. **Board** (main screen): asset nodes in a row on top, the Main Comps + Export Group group below, Preset nodes under it with their Previews to the right in a grid of up to three columns (D69). Inspector side panel. Top bar: + Add, Export, Fonts, Library. Canvas toolbar: tools, zoom, Fit to screen (no smaller than 40 % from tablet width up) and Fit all (D69), Tidy board, grid snap, minimap. On a phone, Add is the first button of the bottom toolbar (D70).
4. Layout editor (Square / Vertical / Horizontal from Main Comps): place/move/resize/rotate/skew (moves and resizes snap to the canvas, the other layers and the layer's spot in the other layouts; double-click a handle or use the reset buttons to undo a transform without moving the layer), layers panel (re-order, lock, hide, delete), text panel.
5. Preview editor (Edit on a Preview): same tools; edits are overrides ("edited" tag), Reset layer / Reset output.
6. Library panel (team assets)
7. Preset manager (admin): sizes and their Preset node family; the families with their sizes, renamed or deleted as a whole
8. Export dialog (formats, scale/dpi, crop marks, outline text, all or selected; large multi-file exports are made and zipped on the server)
9. Team settings (members, roles, invite links)

## Flows
1. **Start**: create project → one of each asset node, wired into Main Comps (3000×3000 px square master). The Image and Logo nodes start without slots and the first text is "Text 1" (D68).
2. **Fill assets**: drop or pick pictures, type text; add more items or more nodes from + Add / right-click.
3. **Compose**: open Square (and Vertical / Horizontal when needed) and arrange; drag the layer groups to re-order.
4. **Add sizes**: pick a family in the empty Export Group, drag a wire out of the group, or + Add → a Preset family; each size gets a wired Preview.
5. **Adjust a Preview**: Edit → move/resize/restyle → stored as overrides.
6. **Change the master or an asset**: every connected Preview re-flows; overridden layers keep their override.
7. **Disconnect / reconnect**: cut a size's wire → frozen; wire it back → re-sync (ask when it has overrides).
8. **Export**: one Preview, a Preset node, or all (ZIP); files named `{project}_{output}_{WxH}.{ext}`.

## Features and acceptance (short; details in BACKLOG)
| ID | Feature | Done when |
|---|---|---|
| F1 | Asset nodes (D49): Logo, Headline, Text, Image, Background | Add/replace/delete items; more nodes from + Add; no layer cap (D39) |
| F2 | Main Comps: group order = z-order (D45, D48); three layouts (D42, D50) | Dragging a group changes stacking everywhere; layouts share layers |
| F3 | Outputs with presets, px/mm, bleed, resolution | Size change re-flows preview instantly |
| F4 | Auto adaptation (rules) | Worked examples in ADAPTATION-RULES pass as unit tests |
| F5 | Manual override + lock + reset | Edit persists across master edits; reset restores auto |
| F6 | Wire/disconnect/reconnect rules | D20/D21 behave exactly |
| F7 | Export single/all, 5 formats | Output pixel size matches spec; Khmer text identical to preview |
| F8 | Team library | Save/reuse source across projects |
| F9 | Auth and roles | viewer read-only; editor edits; admin manages presets and members |
| F10 | Khmer text | Word-safe line breaks; no clipped diacritics; fonts identical in export |
| F11 | Project history (D62) | Earlier versions kept on save and before deletes; preview read-only; restore keeps the current one first; viewers preview only |
| F12 | Review of Previews (D63) | Comments pinned to a Preview (viewers too), replies, resolve; approve per Preview, "Changed since approved" after a change; export warns about unapproved sizes |

## Non-functional
- 10 inputs × 10 outputs stays responsive (previews throttled, thumbnails cached).
- Autosave with optimistic revision; conflict shows "reload latest".
- Uploads validated by magic bytes; SVG sanitized (no scripts, no external refs).
- Export worker runs one job per output; failures reported per output.

## Out of scope for v1
AI layout, background removal, CMYK/PDF-X, PSD/AI import, real-time multi-user editing, Google/Telegram login, direct `.af` import (experimental later ticket).

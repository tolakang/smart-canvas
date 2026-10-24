# Design system (T10.1, T10.2)

The app's look is Figma-like and quiet: neutral greys, one blue accent, small type, and colour used for
meaning (node type, state) rather than decoration. All values are CSS custom properties on `:root` in
`apps/web/src/styles.css`. The editor screen (`.sc-fig`) has its own dark toolbar and maps `--accent` and the
other shared names onto its palette.

## Tokens (refreshed in U1, 2026-10-24)

| Group | Tokens | Notes |
|---|---|---|
| Neutrals | `--bg` #f4f5f7 · `--surface` #fff · `--surface-2` #f1f3f5 · `--surface-3` #e9ecef · `--fg` #14171c · `--muted` #5e6672 · `--line` #e4e7eb · `--line-strong` #cfd4da | Cool greys. `--muted` is 5.9:1 on white, so small grey text passes AA |
| Accent / state | `--accent` #0965cf · `--accent-hover` · `--accent-soft` #e7f0fc · `--on-accent` · `--ring` (focus halo) · `--danger` #c8321b · `--warn` #9a5200 · `--ok` #0d7a3f | U7: every text colour is AA (4.5:1) on every surface in both themes; text on a solid accent or status fill uses `--on-accent` (white in light, near-black in dark, where white on the lighter accent is only 2.8:1) |
| Node types | `--type-input` blue · `--type-main` violet · `--type-output` green (`--type-process` orange-red is kept as a group / tile colour) | Only the 3 px stripe on top of a node |
| Type | `--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-lg` 15 · `--fs-xl` 20; `--font-ui` | **Inter** (bundled, `@fontsource-variable/inter`) for the interface only; artwork fonts are separate (`fonts/bundled.css`) |
| Space | `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 | 4 px grid |
| Radius | `--r-sm` 6 · `--r-md` 8 · `--r-lg` 12 · `--r-xl` 16 | Fields and buttons `md`, nodes and menus `lg`, cards and dialogs `xl` |
| Elevation | `--shadow-1` (rest) · `--shadow-2` (hover, toolbars) · `--shadow-3` (dialogs, menus, floating panels) | Layered, soft shadows |
| Size / motion | `--field-h` 28 px · `--t-fast` 140 ms · `--t-med` 200 ms (ease-out curve) | Motion is off for people who ask for reduced motion |

**Component layer (U1):** the last block of `styles.css` makes focus (an accent outline on keyboard focus, a soft `--ring` halo on fields), buttons (primary with a slight inner highlight), fields, dropdowns (no native chrome; a chevron in the theme's colour), cards and dialogs (blurred backdrop, a short entrance), menus and scrollbars the same everywhere.

## Components

- **Node card** (`.sc-node`, plus `--input`, `--main` or `--output`): white, `--r-lg`, `--shadow-1`, with a type stripe on top. Dashed with a grey stripe when frozen.
  - Header: the title (double-click to rename), then the actions. Actions are faded until you hover the node.
- **Buttons**:
  - `.sc-btn` (default, outlined).
  - `.sc-btn--ghost` (accent text, no border).
  - `.sc-icon-btn` / `.sc-actions button`: 24 px, icon only, `--muted` until hover.
  - Older classes (`.sc-open-editor`, `.sc-upload`, links inside nodes) are styled as `.sc-btn`.
- **Fields**: inputs and selects inside nodes are filled (`--surface-2`), 28 px tall, with a blue border on focus, and are never wider than the card.
  - Segmented controls (px/mm) have a raised selected segment.
- **Icons**: the line icons in `LayerRow.tsx` (`Icon`): 16-unit viewBox, 1.4 stroke, `currentColor`. Emoji are not used as icons.
- **Chip** (`.sc-chip`): a short status, for example "2 edited by hand" on an output.
- **Layer rows** (main node and editor Layers panel): grip, thumbnail, wire dot, name, then actions shown on hover.

## Rules

1. Use tokens; add a token rather than a one-off value.
2. Colour means something: node type, selection, warning, error. Inputs and outputs no longer have tinted backgrounds.
3. One size for controls (28 px) and one icon style.
4. Keep the accessible names when restyling (tests and screen readers use them).

## Themes (T13.3, D34)

Light is the token set on `:root`. Dark redefines the same tokens on `:root[data-theme='dark']`: surfaces `#171a1f`/`#20242b` on a `#0f1115` board, brighter type colours, and stronger shadows.
- `apps/web/src/ui/theme.ts` sets `data-theme` before the first paint. It follows the system setting until the user picks a theme with the top-bar toggle; the pick is remembered per browser.
- React Flow gets `colorMode`, so its dots, controls and minimap follow the theme.
- New tokens:
  - `--ok` / `--ok-soft`, `--warn-soft`, `--danger-soft` (states);
  - `--faint` (idle wires, disabled text);
  - `--canvas` (the editor stage);
  - `--checker-a` / `--checker-b` (transparency).
- Rule: no raw colours in the UI CSS. The artwork itself (`OutputRenderer`, inline styles) never depends on the theme.

## Responsive (T13.6, D33)
- **Breakpoints** (`ui/responsive.ts`, `useScreen()`):
  - **desktop** ≥ 1280 px: the library and inspector are docked.
  - **tablet** 768–1279 px: they open as overlays (`.sc-floating--overlay`) from the canvas toolbar's *Add nodes* and *Inspector* buttons, one at a time.
  - **phone** < 768 px: they open as bottom sheets (`.sc-floating--sheet`). The top bar keeps only Back, the name, the save dot, *More* and Export; everything else is in the *More* menu. The toolbar drops the zoom buttons and the minimap.
- **Touch** (`(pointer: coarse)`, D58):
  - One finger moves the board (empty canvas, panels not selected, their buttons); a tap selects; a selected panel follows the finger.
  - Two fingers pinch and pan anywhere (`board/pinch.ts`); double-tap zooms in.
  - **Select several** replaces Select / Hand in the canvas toolbar: taps add or take out panels, one finger draws a box, the selection bar has Done.
  - Zoomed out below 50 %, a tap on a panel zooms to it and selects it (its controls take taps again close up).
  - A long-press (`ui/long-press.ts`) opens the right-click menus.
  - Tap a port, then tap a target, to wire.
  - Buttons, menu rows and ports are at least 44 px to tap.
- **Editors on a phone:** the canvas, with the Design panel as a bottom sheet (45 vh). The layers panel is hidden, so layers are picked on the canvas.

## Groups (T13.7)
- **Frame:** a tinted frame behind its nodes, in one of six colours: grey (`--faint`), blue (`--type-input`), purple (`--type-main`), green (`--type-output`), orange (`--type-process`), red (`--danger`).
- **Header:** drag it to move the whole group. It holds the name (double-click to rename), a member count, and these buttons: colour (cycles), collapse/expand, export (the outputs in the group), ungroup.
- **Create:** select nodes and press Ctrl/⌘+G, or right-click the selection.
- **Collapsed:** the members hide and the frame shrinks to its header.

## Wires (T13.8)
- **Selection:** with nodes or wires selected, wires that don't touch them dim to 18% opacity.
- **Pulse:** an edit that changes a node (moving it doesn't count) runs a short dashed pulse along every wire downstream of it. There is no pulse with reduced motion.
- **Reroute points:** double-click a wire to add one; drag a point to move it; double-click a point to remove it.

## Editor bar and panels (UI audit)
- **Editor bar:** one line, never scrolls sideways. The tools, zoom and Close keep their size; the title takes the rest and truncates. On a phone, the size, the selection's name (it is in the Design sheet), "100%" and the bar's extra actions are hidden.
- **Numbers:** sizes and positions show as whole design px, matching the selection badge; rotation shows to 0.1°. A field that is tapped and left untouched writes nothing (no nudge, no undo step).
- **Design panel:** touch screens show gestures; keyboard shortcuts are shown only with a mouse.
- **Tablets and phones turned sideways:** layers panel 200 px, Design panel 220 px.
- **Board top bar:** the end group (save state, More, Export) stays right-aligned when the middle group is hidden.
- **Minimap:** desktop only.
- **Fit:** leaves room for the floating toolbar.
- **Phone browsers:** the board and the editors are sized to the visible height (`100dvh`, with `100vh` as the fallback), and the page never scrolls, so the top bar and the bottom toolbar or sheet stay on screen while the browser's address bar and bottom bar show. `viewport-fit=cover` with safe-area padding keeps them clear of notches and the gesture bar.
- **Disconnect a wire:** select it (a tap or a click) and a round × appears just above its middle; it disconnects the wire, like Delete (an output's wire freezes the output). This is the way on touch screens, where wires also get a 36 px tap strip.
- **Phone Export button:** a 36 px rounded icon with a 44 px tap area, clear of the screen edge.

## Projects home, Size presets, Team
- **Buttons:** one primary per form (`.sc-btn--primary`: Create project, Add preset, Create invite link, Copy). Other buttons are default; row actions are ghost buttons, and destructive ones (Delete, Remove, Revoke) are red. Unclassed buttons in a `.sc-card` get the same look, and a card's submit button is its primary.
- **Fields:** 32 px high (40 px on phones, with 16 px text so iOS doesn't zoom), with a focus ring.
- **Rows (`.sc-rows`):** a bordered list. Each row shows the name above one muted line (size, email, or "Edited 5 min ago" with the full date on hover) and puts its actions on the right; on phones the actions wrap under the name.
- **Dialog forms (`.sc-fields`):** a grid of 120 px+ columns that wraps instead of overflowing; the name and email fields span the full width. Optional details go in a hint below the field, not in the label ("Email" plus "Leave it empty for a link anyone can use once…").
- **Long dialogs:** the Close footer sticks to the bottom edge. Dialogs never get wider than the screen less 16 px.
- **Phone home:** full-bleed, no card frame; the team name sits above "Projects".
- **Copy:** "Create project", "Make template" (a copy saved as a template), "Save changes", "Invite someone".

## Editor transform box (D36)
- **Frame:** a 1.5 px accent outline that follows the layer's real shape (a parallelogram when skewed). Handles keep their on-screen size at any zoom and turn with the layer.
- **Handles:** white with an accent border. Corners are 10 px squares; edges are pills along their edge; rotate is a round arrow button 28 px above the top edge. Hit areas are 24 px with a mouse and 44 px on touch. Edge handles hide on a side shorter than 48 px.
- **Skew:** drag an edge along itself. The opposite edge stays put; Alt pivots on the centre; Ctrl/⌘ skews whichever way. The Design panel shows Skew (⫽) next to Rotation.
- **Touch (D58):** tap a layer to select it (again for the one behind); drag the selected layer or a handle at once: move, resize, rotate or skew. One finger anywhere else moves the canvas, two fingers pinch and pan. A double-tap on a handle resets it; on empty canvas it fits.
- **Reset:** double-click or double-tap a handle to undo what it changed: rotate handle = rotation, a corner = scale, an edge = that side's stretch and skew.
- **Snapping:** a move snaps to canvas and layer edges and centres within 6 screen px, shown by a dashed red guide line.

## Board cards and the Delete key
- **Input cards:** the name and a preview of the content, nothing else.
  - The preview keeps the content's shape and never gets wider than the card.
  - An empty picture input shows an upload button. Files can still be dropped on the card.
  - Hidden and library inputs show a small mark next to the name. Double-click the name to rename.
- **Inspector:** name, behaviour, visibility, the content editor, and the actions (Duplicate, Save to library, Delete). The cards don't repeat any of it.
- **Card sizing:** cards size their grid column `minmax(0, 1fr)`, so no thumbnail sticks out of a card. Side ports sit level with the title.
- **Delete / Backspace:** on the board it deletes the selected nodes, with one confirm and one undo step. A selected group is ungrouped; the Layer Comp can't be deleted; selected wires alone are disconnected. In the Layer Comp editor it removes the selected layer, as its row's trash button does. In a Preview editor it hides the layer on that Preview.

## Picture frames (D37)
- **Frame:** an image or SVG layer's frame (selection box, handles, size badge, snapping) is the picture's visible pixels, never its transparent margins.
- **Stretch:** dragging an edge stretches the picture with the frame, live while you drag (Shift or the ratio lock on corners keeps proportions).
- **Replace:** a new picture lands inside the old frame, centred, with its own proportions.

## History (D62)
- **Where:** **History** in the board's top bar (in the More menu on phones) opens a panel in the inspector's place: an overlay on tablets, a bottom sheet on phones.
- **List:** newest first, grouped by Today, Yesterday, then the date. Each row says what the version is (Auto-saved, Before deleting 1 input, Before restore, or its name), then the time and who. The version shown is highlighted.
- **Preview:** the board shows the version read-only under a light-blue bar: "Version from Today, 14:05 · Before deleting 1 input · Dara", with **Restore** (accent, editors only) and **Close**. The save status is hidden while a version is shown.
- **Naming:** an editor names the board as it is now from the field at the top of the panel (hidden while a version is shown). A named version has a trash button; it asks before deleting.

## Comments on Previews (D63)
- **Comment tool:** a speech-bubble tool after Move / Hand in the Preview editor's bar, with the open count on it. While it is on, a click or tap on the Preview pins a new comment there, and the Comments panel takes the Design panel's place.
- **Pins:** accent-blue tags with the thread's number, their tail on the spot; the picked one is dark, resolved ones grey, the one being written amber. Bigger on touch (32 px).
- **Comments panel:** "Show resolved" at the top, then the new comment's box (Post, Cancel), the threads with their replies indented, and "Comment on the whole Preview" at the bottom. Each comment shows who, when and the text; Resolve / Reopen, Edit and Delete show only to whoever may use them. Ctrl/⌘ + Enter posts, Esc cancels.
- **Preview nodes:** a light-blue pill with a speech bubble and the open count, next to the health badge; it opens the editor on its comments.

## Approval and the Review panel (D63)
- **Preview editor bar:** "Approve" (green) for editors; once approved, "✓ Approved by Ada" in green with "Withdraw"; after a change, "Changed since approved" in amber with "Approve again" and "Withdraw". Viewers see the state only ("Not approved" when there is none).
- **Preview nodes:** a row under the header with "✓ Approved" (green pill) or "Changed since approved" (amber pill), and the open-comments pill.
- **Review panel:** **Review** in the top bar (More on phones), in the inspector's place. "N of M approved · K open comments", then the Previews grouped by Preset node, each with its state pill and open count; a tap opens its editor (on its comments when it has some).
- **Export dialog:** once the project has an approval, each size says "· approved", "· changed since approved" or "· not approved", and an amber note counts the chosen ones not approved, with "Only approved (N)".

## Board chrome (U2)
- **Top bar, right side:** save status · **Assets** (a menu: Team fonts, Team library) · History (icon) · Review (icon, with the open-comment count) · theme (icon) · side panel (icon, desktop) · **Export** (primary). One primary button; the rest are quiet icons with tooltips and accessible names.
- **Save status:** "All changes saved" in full on wide screens; "Saved", "Saving…", "Unsaved", "Retrying…" or "Newer version" where the bar is narrow (below 1100 px), never a bare dot.
- **Side panel with nothing selected:** the project's name, "Nothing selected…", three figures (Previews, Approved n/N, open Comments), **Export all**, and the three ways to add to the board. **Hide panel** (and the side-panel icon in the bar) gives the canvas the room; it is remembered on the device.
- **Wire badges:** an idle wire's ✂ is a small quiet dot with a mouse and grows to the scissors under the pointer; a selected wire, and touch screens, always show the scissors.

## Board look (U3 visual redesign)
- **Ambient canvas:** the board sits on a soft multi-colour gradient (`--ambient`, light and dark). The top bar's groups, the canvas and the side panel float on it as rounded glass panels (`--glass`, 14–18 px corners, blur, `--shadow-2`).
- **Top bar:** three pills — project (back, name, undo / redo), **Add** (a solid dark pill, centred), and actions (status, Assets, History, Review, theme, side panel, **Export**).
- **Cards:** 16 px corners, 14 px padding, a soft two-layer shadow that lifts on hover, and a 2 px accent ring with a halo when selected. The header is a gentle tint of the card's colour with a coloured icon chip: assets violet `--head-asset`, Layer Comp blue `--head-master`, Core Rule cyan `--head-rule`, Previews teal `--head-preview`, Presets green `--head-preset`; frozen Previews grey.
- **Layer Comp group:** a soft tinted frame (no dashed line).
- **Wires and ports:** 2 px wires tinted blue, accent with a glow when selected or hovered; 12 px ports with a white ring.
- **Zoomed out (below 60 %):** each panel gets a dark name tag above it (Preview tags add ✓ approved / changed and the open-comment count). Tags keep their screen size at any zoom (`--zoom-inv`) and never take a click (`board/ZoomLabels.tsx`).

## Projects home and sign-in (U5)
- **Brand:** `ui/Brand.tsx` — the mark (three stacked frames on a blue–violet tile) and the name "Smart Canvas".
- **Home:** on the ambient backdrop. A glass brand bar (mark, name, the team, Team and Size presets as quiet buttons), a 36 px "Projects" title with one line of lede and the **New project** button, then the project cards: a 16:10 cover — the project's own work (U5b, D64: a Preview floating like an artboard with a soft shadow on a faint checkerboard, growing a little on hover), or its colour and initial until there is artwork — the name and when it was edited; ⋯ shows on hover (always on touch). Cards lift on hover.
- **Sign in:** a brand panel (the promise, a small illustration of frames) beside the form card; the form has a Show / Hide password button. On narrow screens only the card shows, with the mark above it.

## Dialogs (U6)
- 560 px wide (never wider than the screen), 20 px title, section headings in small caps, actions on the right with the main one last (Cancel, Export).
- Export's sizes are a soft list of rows with checkboxes; Fonts shows each family as a sample card; lists of members and presets are soft cards.

## Editors (U4)
- The editor bar follows the theme: a glass bar (`--fig-bar: var(--glass)`) floating on the ambient backdrop like the board's, with the active tool as a solid accent button. (The old dark bar is gone.)
- On tablets and desktops the Layers panel, the stage and the Design (or Comments) panel float with a 12 px margin and 18 px corners; phones keep the full-width canvas and the bottom sheet.
- With nothing selected, the Design panel shows the canvas size and **Keyboard shortcuts** folded (open it to see them); touch screens show the gestures instead.

## Words, health and access (U7, D64)
- **One name for each thing**, everywhere in the UI: **Layer Comp** (the master artwork and its layouts; its editor is the "Layer Comp editor") and **Preview** (each size; "Preview editor", "Export 3 Previews", "Previews" in the export dialog). Code keeps its model names (`output`, `main`).
- **Empty layers are a to-do, not a warning:** a Layer Comp or Preview whose only issue is wired layers with no file or text yet shows a grey badge with an outlined dot, "N empty layers" (amends D35). Amber stays for real compromises (text that doesn't fit, a clamped layer), red for errors.
- **No emoji as icons:** the library's delete, the Assets card's grid / list switch and the library's empty text use the icon set or words.
- **Contrast:** checked against WCAG AA for every text colour on every surface in both themes (see Tokens). **Focus:** every control shows the accent ring on keyboard focus; project cards lift on focus like on hover. **Names:** every button and field on the board, the editors, the export dialog and the home has an accessible name (checked with a scan of the rendered pages). **Motion:** "reduce motion" turns off every transition and animation.


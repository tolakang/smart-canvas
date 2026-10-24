# Design system (T10.1, T10.2)

The app's look is Figma-like and quiet: neutral greys, one blue accent, small type, and colour used for
meaning (node type, state) rather than decoration. All values are CSS custom properties on `:root` in
`apps/web/src/styles.css`. The editor screen (`.sc-fig`) has its own dark toolbar and maps `--accent` and the
other shared names onto its palette.

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Neutrals | `--bg` #f5f5f5 · `--surface` #fff · `--surface-2` #f5f5f5 · `--fg` #1e1e1e · `--muted` #757575 · `--line` #e6e6e6 · `--line-strong` #d4d4d4 | `--surface-2` is the field fill and the hover fill |
| Accent / state | `--accent` #0d99ff · `--accent-soft` #e5f4ff · `--danger` #dc3412 · `--warn` #b86200 | `--warn`: hand edits, frozen outputs |
| Node types | `--type-input` blue · `--type-main` purple · `--type-output` green (`--type-process` orange-red is kept as a group / tile colour) | Only the 3 px stripe on top of a node |
| Type | `--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-lg` 15 | Inter, then system UI, Noto Sans and Noto Sans Khmer |
| Space | `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 | 4 px grid |
| Radius | `--r-sm` 4 · `--r-md` 6 · `--r-lg` 10 | Fields and buttons use `md`; nodes use `lg` |
| Elevation | `--shadow-1` (rest) · `--shadow-2` (hover, menus) | A selected node also gets a 1 px accent ring |
| Size / motion | `--field-h` 28 px · `--t-fast` 120 ms | Every field and button is 28 px tall |

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

Light is the token set on `:root`. Dark redefines the same tokens on `:root[data-theme='dark']`: surfaces `#262626`/`#333` on a `#1a1a1a` board, brighter type colours, and stronger shadows.
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
- **Delete / Backspace:** on the board it deletes the selected nodes, with one confirm and one undo step. A selected group is ungrouped; the first master preview can't be deleted; selected wires alone are disconnected. In the master preview editor it removes the selected layer, as its row's trash button does. In an output editor it hides the layer on that output.

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

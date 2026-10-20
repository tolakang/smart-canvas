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
| Node types | `--type-input` blue · `--type-main` purple · `--type-output` green | Only the 3 px stripe on top of a node |
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

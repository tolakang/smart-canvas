# Frontend standard (apps/web)

How to build and change the web app: styling with Tailwind on our tokens (D65), the board on React Flow (D32, D49,
D57, D58), the editors (D36), and the checks. Locked decisions in `DECISIONS.md` win over anything here. The tokens
and the look are in `DESIGN-SYSTEM.md`.

## 1. Where things live

| What | Where | Why there |
|---|---|---|
| Tokens: colours, type, radius, shadow, motion; light and dark | `src/styles.css`, `:root` and `:root[data-theme='dark']` | One source; dark mode is a token swap (D34) |
| Tailwind's theme: which tokens are classes, breakpoints, `dark:`, `hover:` | `src/tailwind.css`, imported first in `main.tsx` | Only our tokens exist as classes |
| Cascade layers | `@layer reactflow, theme, base, app, utilities` (`tailwind.css`) | React Flow's sheet is lowest; our CSS is `app`; utilities win over both |
| Shared class lists | `ui/tw.ts` (dialogs), `ui/Brand.tsx`, `board/topbar.ts` (top bar, menus), `board/panel.ts` (side panels, inspector, History, Review), `board/frame.ts` (board frame, notices), `board/card.ts` (the card every node shares), `board/Slot.tsx` (asset slots), `editor/shell.ts` (editor screen, bar, stage, phone tabs), `editor/panels.ts` (Layers, Design, inspector, comments), `shell/Projects.tsx` (tiles) | One file per area, so a look is changed in one place |

CSS that stays CSS, and why:
- **Tokens, base styles, fonts, keyframes** (`styles.css`): Tailwind reads the tokens; keyframes have no utility.
  `styles.css` also still holds the shared components from before Tailwind (about 146 rules: `sc-card`, `sc-dialog`,
  `sc-rows`, `sc-btn`, `sc-seg`, `sc-field`…). They move to utilities only if the owner schedules it (clean-up 2, K3);
  don't add to them.
- **React Flow's own DOM** — pane, wires, minimap, handles (`board/chrome.css`), and React Flow's sheet in the lowest
  layer (`board/reactflow.css`): React Flow draws those elements, not our markup.
- **The editors' transform box** (`editor/editor.css`, `.tb-*`, D36): placed by math, its handles keep their size at
  any zoom.
- **The artwork renderer** (`OutputRenderer`, inline styles): Preview and export share it; one rendering path.

## 2. Writing classes

- **Tokens only.** Tailwind's palette, sizes and fonts are switched off.
  - Colours: `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`,
    `text-danger`… (every colour token in `tailwind.css`). They follow the dark theme by themselves.
  - Text `text-xs` … `text-xl` (`--fs-*`); radius `rounded-sm` … `rounded-xl` (`--r-*`); `font-sans` (`--font-ui`).
  - A value with no token: an arbitrary value (`w-[220px]`, `text-[13px]`). A colour with no token: add a token first
    — the lint guard rejects `bg-[#fff]`.
- **Spacing: one step is 1px.** `p-14` is 14px, `gap-6` is 6px; the `--sp-*` steps as `p-(--sp-2)`.
- **Breakpoints:** `max-md:` phone (under 768px), `md:max-2xl:` tablet, `2xl:` wide (1280px+); `max-lg:` 900px and
  narrower, `max-xl:` 1100px and narrower. Touch: `pointer-coarse:`; no hover: `[@media(hover:none)]:`.
- **Dark mode** comes from the tokens; use `dark:` (our `data-theme`, D34) only for a real difference.
- **States:** `hover:` is plain `:hover` (touch too, as before), `focus-visible:`, `disabled:`, `aria-pressed:`,
  `group-hover/<name>:` with `group/<name>` on the parent.
- **Pseudo-elements:** `after:`, `before:`, `backdrop:` (a dialog's dimmed page).
- **One place per component:** build its classes in a constant or a small function in its area's file (§1).
- **No class helper packages** (`clsx`, `tailwind-merge`): join strings — no new dependency.
- **Keep the `sc-` classes** in the markup: the browser tests find elements by them. They carry no styles.
- **Never put a class on an element a rule finds by having none** (`.sc-card button:not([class])`): style it from its
  parent (`[&>button]:ml-auto`).
- **Accessible names and roles stay** when restyling.

### What the conversion taught us (T1–T7)

- **Weight decides between two state rules.** Write the selector out so the one that should win weighs more:
  `[&:hover:not(:disabled)]:` beats `aria-pressed:` — hover beats pressed, as it did.
- **Shared descendant styles go in `:where()`** — `[:where(&)_button]:h-34` styles every button in the bar at zero
  weight, so a button's own classes still win (`editor/shell.ts`).
- **A shorthand then a longhand** in one old rule: write the shorthand as `[:where(&)]:[border-bottom:…]` and the
  longhand plainly, so the longhand wins (`editor/panels.ts`).
- **Never a class right after `${…}`.** Tailwind reads the source text; `` `cursor-grab${x}` `` is one word to it and
  the class is never generated. Leave a space: `` `cursor-grab ${x}` ``. `pnpm lint` catches it.
- **`_` is a space** in a class. Name a class with `__` as `\_\_` in a `String.raw` string:
  `` String.raw`[.react-flow\_\_node.selected_&]:border-accent` `` (`board/card.ts`).

### Don't / write

| You mean | Don't | Write |
|---|---|---|
| `border: 0` | `border-0` (keeps the style and colour) | `[border:0]` |
| `outline: none` | `outline-none` (style only) | `[outline:none]` |
| `list-style: none` | `list-none` (type only; a `<summary>` keeps `inside`) | `[list-style:none]` |
| a circle | `rounded-full` (a huge length) | `rounded-[50%]` |
| `grid-row: span 2` | `row-span-2` (both lines) | `[grid-row:span_2]` |
| `justify-self: start` / `align-content: start` / `align-items: start` | `justify-self-start`, `content-start`, `items-start` (`flex-start`) | `[justify-self:start]`, `[align-content:start]`, `[align-items:start]` |
| a shadow, transform, filter, backdrop blur | `shadow-*`, `scale-*`, `translate-*`, `drop-shadow-*`, `backdrop-blur-*` (`--tw-*` layers) | `[box-shadow:…]`, `[transform:…]`, `[filter:…]`, `[backdrop-filter:…]` |
| `font-size: 0` | `text-[0]` (ambiguous) | `text-[length:0px]` |
| a colour from a variable | `text-[var(--x)]` (colour or size?) | `[color:var(--x)]` |
| `padding: 0 12px` on a button | `px-12` alone (keeps the browser's 1px) | `px-12 py-0` |
| a border on one side | `[border:0] [border-top:…]` (two properties, Tailwind's order) | one shorthand per side: `[border-top:…] [border-right:0]…`, or longhands |
| a shorthand and a longhand | `[border:1.5px_dashed_…] border-accent` on one element (Tailwind's order) | longhands only: `border-[1.5px] border-dashed border-accent` |
| only a background colour under a stronger rule's image | `[background:…]` (clears the dropdown chevron) | `[background-color:…]` |
| a class built in a template | `` `group-hover/slot:${FILL}` `` (never generated) | the whole class written out in a string (`Slot.tsx`) |

## 3. The board with React Flow

The board (D49: asset nodes → Main Comps + Export Group → Preset nodes → Previews; names D66) is `@xyflow/react` v12.

- **The doc is the source of truth; React Flow state is a view.** `ProjectDoc` (packages/core) owns positions, wires
  (typed `edges`, D32) and groups. `docToNodes` / `docToEdges` (`board/flow.ts`) build the view; `syncNodes` (`Board.tsx`) keeps
  React Flow's own fields (`measured`, `selected`, drag state). — A `setNodes` that isn't in the doc is lost on the
  next sync.
- **Change the doc through `run((doc) => coreFn(doc, …))`** or the board's helpers (`reconnect`, `savePositions`). —
  Undo, autosave and every client see the same change.
- **Positions are saved once, on `onNodeDragStop`,** from the shown positions. — The guides may have snapped them.
- **Layout is computed, never stored.** Group frames, the Preset node's "in" edge (`setInEdgeId`) and asset-card edges
  (`cardEdgeId`, D49.1) are drawn from the doc each render. — Only overrides are stored (CLAUDE.md).
- **Ids: one prefix per kind, always through the helpers** in `flow.ts`: `src:` input, `stk:` asset card, `hl:`
  Headline card, `set:` Preset node, `main` / `comp:` Main Comps, `out:` Preview, `grp:` group (`isGroupNode`). Handles: `out`,
  `layers` (`LAYERS_HANDLE`), `p<N>` ports, `row:<outputId>`. — Never string-build ids in components.
- **Register a node type once**, in `nodeTypes` (`board/nodes.tsx`); edge types in `edgeTypes` (`Board.tsx`). — A new
  object each render remounts every node. Never name a type `input`, `output` or `default` (React Flow's built-ins).
- **Type the node** in `flow.ts` (`Node<{…}, 'myNode'>`, added to `BoardNode`); components take `NodeProps<…>`.
- **Controls inside a node carry `NO_CANVAS`** (`'nodrag nopan nowheel'`, from `board/pinch.ts`). — A click or scroll doesn't drag the node or
  pan the board. Touch grips use `TOUCH_NO_PAN` (`pinch.ts`); the board's `noPanClassName` switches on coarse pointers (D58).
- **Ports are typed (D32).** Whether a wire may connect is `connectionRefusal(doc, connection)` (`flow.ts`), passed
  through `isValidConnection`; the drop handler explains a refusal. — No connection rules in components or CSS.
- **Changing a node's handles** → `useUpdateNodeInternals()(nodeId)` afterwards (`PresetNode.tsx`). — Or wires attach
  to stale positions.
- **One edge type, `routed`** (`RoutedEdge.tsx`: bezier or reroute points, ✂ on hover / selection). Variations are data
  (`points`, `noCut`) or classes (`sc-edge--dim`, `sc-edge--pulse`). — One place draws every wire.
- **Delete and reconnect wires through the board's handlers** (`onEdgesDelete`, `deleteElements`, `onReconnect*` in
  `Board.tsx`). — The doc rules run: a Preview's wire freezes it; an empty card's wire sets `unwired` (D49.1).
- **Read-only (viewer):** read `readOnly` from `useBoard()` and hide every edit control.
- **Performance:** node components are pure functions of `data` plus `useBoard()`; no `useNodes()` / `useEdges()`
  inside a node. — They re-render every node on every drag.
- **Zoom and touch (D58):** wheel pans, Ctrl/⌘ + wheel zooms; pinch and two-finger pan are ours (`usePinch`,
  `ZOOM_LIMITS`, `FIT_OPTIONS`); one finger moves the board; hit targets of at least 44px. Things that keep their
  screen size read `--zoom` or live in `ViewportPortal` (`ZoomLabels.tsx`). Keep `onlyRenderVisibleElements` off — the
  zoomed-out tags and the minimap need every node. No `<Controls>`: `CanvasToolbar` is the zoom UI.
- **Grid snap and Tidy (D57):** a 16px grid; alignment guides while dragging (`guides.ts`, `align()` in
  `onNodesChange`); Tidy lays panels out (`tidy.ts`). — No layout libraries (dagre, elkjs).
- **Groups are derived, never stored as nodes** (`GroupNode.tsx`, `withGroupFrames`): the frame is drawn from its
  members each render; dragging it moves them. `parentId` is not used.
- **The editors are not React Flow.** They use our transform box (D36); never `NodeResizer` / `NodeToolbar` in the
  artwork editors, and never draw the artwork with React Flow (Preview and export share `OutputRenderer`).

## 4. Styling a node or a wire

- **Cards:** every node uses `NodeHead` (icon tile, name, quiet line, ⋯ menu; D64) and `cardClass(kind)` from
  `board/card.ts`. — One card look for every node.
- **Inside a node, utilities are fine** for our own markup: rows, fields, slots, buttons, labels (`Slot.tsx`,
  `TextNode.tsx`). Put `NO_CANVAS` on anything you can click.
- **Stays in `board/chrome.css`:** React Flow's handles, edges (`.react-flow__edge-path`), pane, minimap, selection
  box, and the wire state classes. — React Flow renders those elements; our markup doesn't own them.
- **Selected and hover come from React Flow's classes,** read from the card with `String.raw` variants:
  `[.react-flow\_\_node.selected_&]:…`, `[.react-flow\_\_node:hover:not(.selected)_&]:…` (`board/card.ts`). — Don't
  pass `selected` down just to style things.
- **Labels and buttons on a wire** go in `EdgeLabelRenderer` with `nodrag nopan` (§7).

## 5. Checklists

### (a) A new node type, end to end
1. Model and rules in `packages/core` first, with unit tests; a model change needs a note in `DECISIONS.md`.
2. `flow.ts`: id helpers, a `Node<…>` type added to `BoardNode`, built in `docToNodes` (edges in `docToEdges`).
3. The component: `NodeHead`, `cardClass(kind)`, typed `Handle` ids, `NO_CANVAS` on controls, `readOnly` respected.
4. Register it in `nodeTypes` (`nodes.tsx`); add it to **+ Add** and the right-click menu if users create it.
5. Connections: extend `connectionRefusal` (`flow.ts`), and `onConnect` in `Board.tsx` if it wires specially.
6. Delete: `delete-nodes.ts`. Zoomed-out tag: `panelTitle` (`ZoomLabels.tsx`). An inspector section if it has settings.
7. Tests: a unit test for the doc ↔ flow mapping; one e2e test that adds, wires and deletes it.
8. `pnpm lint`, `pnpm typecheck`, `pnpm build`, the tests (§6).

### (b) A new wire behaviour
1. Is it data or a class on the one `routed` edge (`RoutedEdgeData`, `sc-edge--*`)? Never a new edge type.
2. Whether it may connect: `connectionRefusal` (and its unit test in `wires.test.ts`).
3. What deleting or reconnecting does: in the doc, through `onEdgesDelete` / `onReconnect*`.
4. Its look: React Flow's edge path in `board/chrome.css`; a badge or button in `EdgeLabelRenderer` with utilities.
5. An e2e test for the gesture (drag, cut, reconnect).

### (c) A new screen or panel
1. Tokens and components from `DESIGN-SYSTEM.md`; a new colour is a new token first.
2. Its classes as constants in its area's file (§1) — or a new `*.ts` next to it for a new area.
3. Utilities only; no new `.css` file (`pnpm lint` rejects one). Check the Don't / write table (§2).
4. Keep an `sc-` hook on the elements tests find; real roles and accessible names.
5. Phone, tablet and wide (`max-md:`, `md:max-2xl:`, `2xl:`), touch (`pointer-coarse:`), dark theme.
6. An e2e test for what it does.

## 6. Tests and checks

```
pnpm i
pnpm lint          # eslint + scripts/check-css.mjs: no hex colour outside a token, no unused sc- class in CSS,
                   # each selector in one stylesheet, no -webkit-backdrop-filter, no new .css file,
                   # no class written right before ${…}
pnpm typecheck
pnpm build
pnpm test          # vitest: unit tests, and the e2e tests when TEST_DATABASE_URL is set
```

E2E (Playwright, in `apps/worker/src/*.e2e.test.ts`) needs Postgres:
```
service postgresql start
cd apps/worker
TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres npx vitest run src/<name>.e2e.test.ts
```
- Seed a board through the API with core functions (`addOutput`, …) and `page.request.put`, as
  `comments.e2e.test.ts` does, rather than many clicks.
- Locators: `.react-flow__node-<type>[data-id="out:banner"]`, a node by title (`.react-flow__node` filtered by
  `.sc-node__title`), `.react-flow__edge`; `getByRole('button', { name: /^Fit to screen/ })` before measuring.

While the parity test exists (until T8), a styling PR that should look the same runs it — every screen, drawn with
this branch's CSS and with main's, must match in computed styles and pixels:
```
node scripts/css-reference.mjs        # after every stylesheet change: main's CSS and areas.json
cd apps/worker
export TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres
SC_PARITY_ONLY=history,review npx vitest run src/css-parity-board.e2e.test.ts   # while working
npx vitest run src/css-parity-                                                  # before the PR (CI runs all)
```
How it works: `TAILWIND-PLAN.md`, "How a conversion PR works".

## 7. Examples from the code

A node (`board/TextNode.tsx`, shortened): the card, its head, a control with `NO_CANVAS`, a typed handle.
```tsx
export function TextNodeView({ data, selected }: NodeProps<StackFlowNode>) {
  const { stack, items } = data;
  const { readOnly, run } = useBoard();
  return (
    <div className={`${cardClass('input')} sc-node--text-node`} aria-label={`Text node ${stack.label}`}>
      <NodeHead icon="text" title={stack.label} sub={`${items.length} texts`} menuLabel={`${stack.label} actions`} /* … */ />
      {/* … one slot per text … */}
      {!readOnly && (
        <button type="button" className={`sc-btn sc-btn--soft sc-text-slots__add w-full justify-center ${NO_CANVAS}`}
          onClick={() => run((d) => addTextToStack(d, stack.id, { id: newId() }))}>
          <Icon name="plus" /> Add text
        </button>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={!readOnly} className="sc-handle--layer" />
    </div>
  );
}
```

A class-list constant (`board/topbar.ts`): the shared part once, each button adds its own; hover written to outweigh
pressed.
```ts
const BUTTON =
  'inline-flex items-center gap-6 text-sm whitespace-nowrap [transition:background_var(--t-fast),border-color_var(--t-fast),box-shadow_var(--t-fast),transform_var(--t-fast)] [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] disabled:cursor-default focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1';
export const ICON = `sc-topbar__icon ${BUTTON} size-34 justify-center rounded-[10px] p-0 font-[500] text-muted [background:none] [border:0] aria-pressed:bg-accent-soft [&:hover:not(:disabled)]:text-fg …`;
```

A button on a wire (`board/RoutedEdge.tsx`): in `EdgeLabelRenderer`, `nodrag nopan`, deleting through React Flow so
the board's `onEdgesDelete` runs the doc rules.
```tsx
<EdgeLabelRenderer>
  <button
    type="button"
    className={`${CUT} ${selected ? CUT_SELECTED : CUT_HOVER} nodrag nopan`}
    style={{ transform: `translate(-50%, calc(-100% - ${selected ? 12 : 6}px)) translate(${mid.x}px, ${mid.y}px)` }}
    aria-label={selected ? 'Disconnect wire' : 'Cut wire'}
    onClick={(e) => {
      e.stopPropagation();
      void deleteElements({ edges: [{ id }] });
    }}
  >
    <ScissorIcon />
  </button>
</EdgeLabelRenderer>
```

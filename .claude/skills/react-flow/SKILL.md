---
name: react-flow
description: How this project's flow board is built on @xyflow/react v12, and how to add or change nodes, handles, wires, menus, zoom and touch behaviour on it the project's way. Use for any change under apps/web/src/board (Board.tsx, nodes, edges, flow.ts) or any task that mentions the board, a node, a port or handle, a wire or edge, the canvas, the minimap, zoom, pan, Tidy, groups or React Flow. Also maps every React Flow UI component (reactflow.dev/ui) and example (reactflow.dev/examples) onto what the board already has.
---

# React Flow on this board

The board (D49: asset nodes → Layer Comp + Core preset → Preset nodes → Previews) is React Flow v12 (`@xyflow/react`
^12.12, `apps/web/package.json`). Read this before touching `apps/web/src/board/`. Locked decisions in
`docs/DECISIONS.md` win over anything here; the ones that matter most are named inline (D32, D36, D49, D57, D58, D64).

## 1. The shape of the board

| Piece | Where | What it does |
|---|---|---|
| `<ReactFlow>` and every handler | `board/Board.tsx` (~line 1443) | One instance. Controlled `nodes` / `edges`, `colorMode={theme}`, `fitView`, `panOnScroll`, `zoomOnScroll={false}`, `deleteKeyCode={null}` (Delete is ours, `board-keys.tsx`). |
| Doc ↔ flow | `board/flow.ts` | `docToNodes(doc)`, `docToEdges(doc)`, `syncNodes(current, fresh)`, the id helpers. |
| Node types | `board/nodes.tsx:111` (`nodeTypes`) | `inputNode`, `assetsNode`, `textNode`, `headlineNode`, `presetNode`, `mainNode`, `outputNode`, `groupNode`. Module-level constant. |
| Edge types | `board/Board.tsx:244` (`edgeTypes = { routed: RoutedEdge }`) | One edge type: `board/RoutedEdge.tsx` (bezier or reroute points, ✂ badge on hover/selection). |
| Board actions for nodes | `board/context.ts` (`useBoard()`) | Nodes call `run(doc => …)`, `readOnly`, etc. They never edit React Flow state for doc changes. |
| Zoomed-out name tags | `board/ZoomLabels.tsx` | `ViewportPortal`, fixed screen size via `--zoom`; never takes a click. |
| Toolbar, minimap | `board/CanvasToolbar.tsx`, `<MiniMap>` in Board | Zoom, fit, Select/Hand, grid, Tidy. Minimap only on desktop. |
| Touch | `board/pinch.ts` (`usePinch`, `TOUCH_NO_PAN`) | D58: two-finger pinch and pan are ours; one finger moves the board. |
| Grid snap, Tidy | `board/tidy.ts`, `guides.ts` | D57: 16 px grid; alignment guides while dragging (`align()` inside `onNodesChange`). |
| Groups | `board/GroupNode.tsx` | T13.7: frames are derived from members every render, never stored. Dragging a frame moves its members. |

### The doc is the source of truth
- `ProjectDoc` (packages/core) owns everything: node positions live in `board` on each source, composition and output, and wires are the doc's typed `edges` (D32).
- React Flow state is a **view**: `nodes` and `edges` come from `docToNodes` / `docToEdges`. After every doc change, `syncNodes(ns, docToNodes(doc))` keeps React Flow's own fields (`measured`, `selected`, drag state) and refreshes `data`.
- Doc changes go through `run((doc) => coreFn(doc, …))` or the board's helpers (`reconnect`, `savePositions`), never `setNodes` alone. A `setNodes` that isn't mirrored into the doc is lost on the next sync.
- Positions are saved once, on `onNodeDragStop` (`savePositions`), from the *shown* positions, because the guides may have snapped them. Don't save on every `position` change.
- Layout is computed, never stored (CLAUDE.md). Derived things such as group frames, the Preset node's "in" edge (`setInEdgeId`) and asset-card edges (`cardEdgeId`, D49.1) are drawn from the doc each render; don't persist them.

### Ids (flow.ts): one prefix per kind
`src:` input · `stk:` asset card (D40) · `hl:` Headline card (D44) · `set:` Preset node (D46) · `main` / `comp:` Layer Comp
(D49) · `out:` Preview · `grp:` group frame. Handles: `out`, `layers` (`LAYERS_HANDLE`), `p<N>` ports, `row:<outputId>` on
Preset rows. Always use the helpers (`stackNodeId`, `outputIdOfNode`, `docIdOfNode` …), never string-build ids in components.

## 2. Rules for nodes

1. **Register a type once**, in `nodeTypes` (nodes.tsx). Never create `nodeTypes` / `edgeTypes` inside a component: a new object every render makes React Flow re-mount every node. Never name a type `input`, `output` or `default`: those are React Flow built-ins with their own CSS.
2. **Type the node** in flow.ts: `Node<{ … }, 'myNode'>`, add it to `BoardNode`, and build it in `docToNodes`. Components take `NodeProps<MyFlowNode>`.
3. **Inside a node, interactive elements carry `NO_CANVAS = 'nodrag nopan nowheel'`.** That covers buttons, inputs, slots, scroll areas and menus, so a click or a scroll doesn't drag the node or pan the board. Grips that should still allow a touch pan use `TOUCH_NO_PAN` (pinch.ts); `noPanClassName` switches between the two on coarse pointers (D58).
4. **Handles are typed ports (D32).** Whether a wire may connect is decided by core (`connectionRefusal(doc, connection)`), through `isValidConnection`; the drop handler explains a refusal. Don't add connection rules in components or in CSS.
5. **Changing a node's handles** (adding or removing a row, moving a port) means calling `useUpdateNodeInternals()(nodeId)` afterwards, as `PresetNode.tsx` does, or the wires attach to stale positions.
6. **Header and look:** every card uses `NodeHead` (icon tile, name, quiet line, ⋯ menu; V1/D64) and the `sc-node` classes. Selected and hover states come from React Flow's `.selected` class and our CSS, so don't pass `selected` down to style things.
7. **Read-only (viewer):** nodes read `readOnly` from `useBoard()` and hide every edit control. React Flow's `nodesConnectable`, `nodesDraggable` and `edgesReconnectable` are already off on the board.
8. **Performance:** keep node components pure functions of `data` plus `useBoard()`. Don't call `useNodes()` / `useEdges()` inside a node (that re-renders every node on every drag); select only what you need with `useStore(selector)` if you must. Stable callbacks (`useCallback`) for everything passed to `<ReactFlow>`.

## 3. Rules for wires

- **One edge type, `routed`.** Variations are data (`RoutedEdgeData`: `points`, `noCut`) or classes (`sc-edge--dim`, `sc-edge--pulse`), not new edge types.
- **Deleting a wire** goes through the board's edge deletion (`onEdgesDelete` / `deleteElements`), so the doc rule runs (an output's wire freezes it; an empty card's wire sets `AssetStack.unwired`, D49.1).
- **Reconnecting:** `edgesReconnectable`, `reconnectRadius={16}`, `connectionRadius={36}`; the handlers live in Board.tsx.
- **Labels and buttons on a wire** use `EdgeLabelRenderer` with `NO_CANVAS` (RoutedEdge's ✂ / Disconnect badge).

## 4. Viewport, zoom, touch

- Wheel pans and Ctrl/⌘ + wheel zooms (T13.5); pinch is `usePinch`. Zoom limits are `ZOOM_LIMITS`. Fit uses `FIT_OPTIONS`.
- Anything that must keep its screen size at every zoom (name tags, badges) reads `--zoom`, or lives in `ViewportPortal` with a counter-scale. ZoomLabels is the model.
- `onlyRenderVisibleElements` stays off: zoomed-out boards need every node for the tags and the minimap.
- Don't add `<Controls>`: `CanvasToolbar` is the zoom UI.

## 5. What the editors are not
The Layer Comp and Preview editors (`apps/web/src/editor/`) are **not** React Flow. They use our own transform box
(D36). Don't bring `NodeResizer` / `NodeToolbar` into the artwork editors, and never draw the artwork with React Flow:
Preview and export share `OutputRenderer` (CLAUDE.md).

## 6. React Flow UI (reactflow.dev/ui): what we use instead

React Flow UI is a shadcn/ui registry: each component is copied into the app with the shadcn CLI and styled with
**Tailwind CSS 4** and shadcn theming. This project now has Tailwind 4 (D65, `TAILWIND-PLAN.md`) but not shadcn, and
its Tailwind theme holds only our tokens. So **don't run the shadcn CLI**: take the idea (or a component's markup) and
style it with our utilities (`bg-surface`, `border-line`, `rounded-md`, `text-sm`…) and our `sc-` classes. The full
catalogue (2026-10), mapped:

| Component (`/ui/components/…`) | What it is | On this board |
|---|---|---|
| Base Node (`base-node`) | A node with basic styling (header / content / footer) | `NodeHead` + `.sc-node` / `.sc-node__head`; header colour per role (`--head-*` tokens) |
| Base Handle (`base-handle`) | A handle with basic styling | `.sc-port` rows; typed colours (D32) |
| Labeled Handle (`labeled-handle`) | A handle with a label | `.sc-port__label` (MainNode, PresetNode rows) |
| Button Handle (`button-handle`) | A handle that adds a new node from a dropdown | Not used: new nodes come from **+ Add**, the right-click menu, or a wire dropped on the canvas (`onConnectEnd`) |
| Node Status Indicator (`node-status-indicator`) | A wrapper with several states for a node's status | `HealthBadge` (T13.1) and the Preview approval state (D63) |
| Node Tooltip (`node-tooltip`) | A tooltip on node hover | Native `title` and our `.sc-tip` tooltips; zoomed out, `ZoomLabels` |
| Node Appendix (`node-appendix`) | Extra info in an absolutely positioned container beside a node | The Preview's approval / comment badges and the zoomed-out tags (ZoomLabels) |
| Placeholder Node (`placeholder-node`) | A ghost node you click to create a real one | The empty asset slots (`Slot`, "Add") and the empty card's wire (D49.1) |
| Labeled Group Node (`labeled-group-node`) | A group node with an optional label | `GroupNode` (T13.7): a derived frame you can rename, collapse and export |
| Database Schema Node (`database-schema-node`) | A table-like node, one handle per row | Same pattern as the Preset node: one row, one `row:<id>` handle |
| Button Edge (`button-edge`) | An edge with a button on it | `RoutedEdge`'s ✂ / Disconnect badge (`EdgeLabelRenderer`) |
| Data Edge (`data-edge`) | An edge showing a value from the source node's data | Not used; a wire shows nothing but its state classes |
| Animated SVG Edge (`animated-svg-edge`) | An SVG element moving along the edge | `.sc-edge--pulse` (a change runs downstream, T13.8) |
| Zoom Slider (`zoom-slider`), Zoom Select (`zoom-select`) | Zoom controls | `CanvasToolbar` (−, %, +, fit) |
| Node Search (`node-search`) | Find a node by name and fit the view to it | Not built yet. If asked: search `panelTitle(doc, id)` (ZoomLabels) and call `fitView({ nodes: [{ id }] })` |
| DevTools (`devtools`) | Viewport data, each node's state, a log of change events | Debug only, never shipped. Logging `onNodesChange` locally does the same job |

**Borrowing a React Flow UI component's markup:** rewrite every class. Our Tailwind theme is our tokens only: one
spacing step is 1px (`p-4` is 4px, not 16px), Tailwind's default palette, sizes and fonts don't exist (`bg-white`,
`shadow-sm`, `text-base` mean something else or nothing), shadcn's theme names (`bg-background`, `text-primary`) and
its `cn()` / `tailwind-merge` aren't there. Use our colour tokens (`bg-surface`, `text-muted`, `border-line`), px
spacing, and the class lists the board already has (`board/topbar.ts`).

Core `@xyflow/react` components (no new dependency): `NodeToolbar`, `EdgeToolbar` (both in 12.12) and `NodeResizer`.
None is used today. Actions live in the ⋯ menu and on hover (V1), and the editors have their own transform box (D36).

## 7. Examples (reactflow.dev/examples) mapped to existing code

Check here before building something from an example: most are already done the project's way. Examples that need
a new library (dagre, elkjs, d3-force, libavoid, yjs, html-to-image, Puppeteer) are **not** to be copied in. Use
what is named instead.

| Category | Example (`/examples/…`) | Here |
|---|---|---|
| Nodes | `custom-node`, `update-node` | Every `nodeTypes` entry; data changes go through the doc (`run`) |
| | `connection-limit` | `connectionRefusal` in core (D32), not `isConnectable` counts |
| | `easy-connect`, `proximity-connect` | `connectionRadius={36}`; no auto-wiring on proximity |
| | `add-node-on-edge-drop` | `onConnectEnd`: a wire dropped on the canvas offers a Preset node (N4) |
| | `drag-handle` | Whole card drags; controls opt out with `NO_CANVAS` |
| | `node-toolbar`, `node-resizer`, `rotatable-node` | Not on the board (see §6); rotation and resize live in the editors (D36) |
| | `delete-middle-node`, `intersections`, `node-position-animation`, `shapes`, `stress` | Delete rules in `delete-nodes.ts`; Tidy glides panels (D57); one card shape |
| Edges | `edge-types`, `custom-edges`, `editable-edge` | `RoutedEdge` (bezier, or through reroute points you drag, T13.8) |
| | `edge-label-renderer`, `edge-toolbar` | ✂ / Disconnect badge via `EdgeLabelRenderer` |
| | `reconnect-edge`, `delete-edge-on-drop` | `onReconnect*` in Board.tsx |
| | `animating-edges` | `.sc-edge--pulse` |
| | `markers`, `floating-edges`, `simple-floating-edges`, `custom-connectionline`, `multi-connection-line`, `temporary-edges`, `edge-intersection`, `edge-routing` | Not used: fixed typed ports, no arrows |
| Interaction | `validation`, `prevent-cycles` | `connectionRefusal` (core) |
| | `context-menu` | `ContextMenu.tsx` + `onNodeContextMenu` / `onPaneContextMenu` / `onSelectionContextMenu` |
| | `drag-and-drop` | Files dropped on the canvas make an Image node; **+ Add** places nodes (N4) |
| | `save-and-restore` | Autosave of the doc (`autosave.ts`) and versions (Q3, D62), not `toObject()` |
| | `undo-redo`, `copy-paste` | Doc history (`history.ts`) and the board's duplicate action, not React Flow state |
| | `helper-lines` | `align()` guides in `onNodesChange` (T13.5) |
| | `touch-device` | D58 (`usePinch`, `noPanClassName`, `nodeDragThreshold`, larger touch targets) |
| | `contextual-zoom` | Zoomed out, panels show name tags (`ZoomLabels`, `LABEL_ZOOM`) |
| | `connection-events`, `computing-flows`, `collaborative` | Connections are handled in Board.tsx; data flow is core's layout engine; no live collaboration |
| Layout | `auto-layout`, `dagre`, `elkjs`, `elkjs-multiple-handles`, `dynamic-layouting`, `horizontal`, `force-layout`, `node-collisions`, `expand-collapse` | **Tidy** (`tidy.ts`, D57) and N4 placement. No layout libraries |
| Grouping | `sub-flows`, `parent-child-relation`, `selection-grouping` | Group frames (T13.7), derived; `parentId` is not used |
| Styling | `dark-mode`, `base-style`, `tailwind`, `turbo-flow` | `colorMode={theme}` plus our tokens; React Flow's classes restyled in `board/chrome.css` (`.react-flow__*`); Tailwind utilities on our own markup (D65) |
| Whiteboard | `lasso-selection`, `rectangle`, `freehand-draw`, `eraser` | Box selection only (`selectionOnDrag`, Select several on touch) |
| Misc | `download-image`, `server-side-image-creation` | Export renders Previews with `OutputRenderer` in the worker (Playwright), never the board |

## 8. Tests

- **Pure logic** (`flow.ts`, `wires.ts`, `tidy.ts`, `guides.ts`, `delete-nodes.ts`) gets vitest unit tests next to it, for example `empty-card.test.ts` and `wires.test.ts`.
- **Behaviour** gets a Playwright e2e test in `apps/worker/src/*.e2e.test.ts` (Postgres needed: `service postgresql start`, then `TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres`). Useful locators:
  - `.react-flow__node-<type>[data-id="out:banner"]`
  - a node by title: `.react-flow__node` filtered by `.sc-node__title`
  - `.react-flow__edge`, `.react-flow__pane`
  - `getByRole('button', { name: /^Fit to screen/ })` before measuring anything
- Seed a board through the API with core functions (`addOutput`, …) and `page.request.put`, as `comments.e2e.test.ts` does, rather than many UI clicks.
- **CSS changes**: each board area has its own file (`board/node.css`, `chrome.css`, `assets.css`, `pipeline.css`, `review.css`), imported right after `styles.css` in `main.tsx`; `pnpm lint` keeps each selector in one file, every colour a token and no unused `sc-` class. Tailwind (D65, `TAILWIND-PLAN.md`) is replacing them area by area: React Flow's sheet sits in the lowest cascade layer (`board/reactflow.css`), ours in `app`, utilities on top (`tailwind.css`); keep the `sc-` classes in the markup and run `css-parity.e2e.test.ts`.

## 9. Checklist: a new node type

1. Model and rules in `packages/core` first (with tests). Model changes need a DECISIONS note.
2. flow.ts: id helpers, a `Node<…>` type, add it to `BoardNode`, build it in `docToNodes` (and edges in `docToEdges`).
3. Component `XNode.tsx`: `NodeHead`, `Handle`s with typed ids, `NO_CANVAS` on controls, `readOnly` respected.
4. Register it in `nodeTypes` (nodes.tsx). Add it to the + Add menu and the right-click menu if users create it.
5. Connections: extend `connectionRefusal` in core, and `onConnect` in Board.tsx if it wires specially.
6. Delete: `delete-nodes.ts`. Zoomed-out tag: `panelTitle` in ZoomLabels. Inspector section if it has settings.
7. Tests: a unit test for the doc ↔ flow mapping, and one e2e test that adds, wires and deletes it.
8. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the tests (with Postgres).

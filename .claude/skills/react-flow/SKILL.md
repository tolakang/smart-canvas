---
name: react-flow
description: How this project's flow board is built on @xyflow/react v12, and how to add or change nodes, handles, wires, menus, zoom and touch behaviour on it the project's way. Use for any change under apps/web/src/board (Board.tsx, nodes, edges, flow.ts) or any task that mentions the board, a node, a port or handle, a wire or edge, the canvas, the minimap, zoom, pan, Tidy, groups or React Flow. Also maps the React Flow UI catalogue (reactflow.dev/ui) and the examples (reactflow.dev/examples) onto what the board already has.
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

React Flow UI is a shadcn/ui registry: components are copied in with the shadcn CLI and styled with **Tailwind**. This project has no Tailwind and no shadcn ("no new dependency without saying why", and Tailwind is undecided). So **don't install these**. Take the idea and build it with our classes and tokens. Mapping:

| React Flow UI component | Its idea | On this board |
|---|---|---|
| Base Node (header / content / footer) | One card shell for every node | `NodeHead` + `.sc-node` / `.sc-node__head`; header colour per role via `--head-*` tokens |
| Base Handle, Labeled Handle | A styled port, optionally with a label beside it | `.sc-port`, `.sc-port__label` rows (MainNode, PresetNode); typed colours (D32) |
| Button Handle | A handle with a button attached (add the next node) | Not used: new nodes come from **+ Add**, the right-click menu, or by dragging a wire onto the canvas (`onConnectEnd`) |
| Node Status Indicator | Loading / success / error ring on a node | `HealthBadge` (T13.1 layout health) and the Preview's approval state (D63) |
| Placeholder Node | A ghost node you click to create a real one | The empty asset slots (`Slot`, "Add") and the empty-card wire (D49.1) |
| Labeled Group Node | A group frame with a title | `GroupNode` (T13.7): derived frame, rename, collapse, export |
| Zoom Slider, Zoom Select | Zoom controls | `CanvasToolbar` (− %, +, fit) |
| Node Search | Find a node by name and fit to it | Not built yet. If asked: search `panelTitle(doc, id)` (ZoomLabels) and `fitView({ nodes: [{ id }] })` |
| DevTools | Viewport, node state and change log for debugging | Debug only, never shipped. Logging `onNodesChange` locally does the same job |
| Database Schema Node | Table-like node with a handle per row | Same pattern as our Preset node: one row, one `row:<id>` handle |

`NodeToolbar` and `NodeResizer` are core `@xyflow/react` components, not part of React Flow UI, so they can be used without a new dependency. Today no node uses them; actions live in the ⋯ menu and on hover (V1).

## 7. Examples (reactflow.dev/examples) mapped to existing code

Before building something from an example, check here. Most are already done the project's way.

| Example | Here |
|---|---|
| Custom Nodes | Every `nodeTypes` entry |
| Node Toolbar | Not used (see §6) |
| Connection Limit, Validation | `connectionRefusal` in core, via `isValidConnection` (D32) |
| Proximity Connect, Easy Connect | `connectionRadius={36}` |
| Edge Types, Custom Edges, Edge Markers | `RoutedEdge` (bezier or reroute points) |
| Reconnect Edge | `onReconnect*` in Board.tsx |
| Edge with button / label | RoutedEdge ✂ and Disconnect badge (`EdgeLabelRenderer`) |
| Context Menu | `ContextMenu.tsx`, `onNodeContextMenu` / `onPaneContextMenu` / `onSelectionContextMenu` |
| Drag and Drop (sidebar → canvas) | Files dropped on the canvas become an Image node; **+ Add** places nodes (N4) |
| Save and Restore | Autosave of the doc (`autosave.ts`) and version history (Q3, D62), not `toObject()` |
| Undo and Redo, Copy and Paste | Doc history (`history.ts`) and the board's duplicate action, not React Flow state |
| Helper Lines | `align()` guides in `onNodesChange` (T13.5) |
| Auto Layout / Dynamic Layouting (dagre, elk) | **Tidy** (`tidy.ts`, D57). Don't add dagre or elkjs |
| Sub Flows, Group nodes | Group frames (T13.7); nested parents (`parentId`) are not used |
| Theming, Dark Mode | `colorMode={theme}` plus our tokens; React Flow's own classes are restyled in styles.css (`.react-flow__*`) |
| Touch device | D58 (`usePinch`, `noPanClassName`, `nodeDragThreshold`) |

## 8. Tests

- **Pure logic** (`flow.ts`, `wires.ts`, `tidy.ts`, `guides.ts`, `delete-nodes.ts`) gets vitest unit tests next to it, for example `empty-card.test.ts` and `wires.test.ts`.
- **Behaviour** gets a Playwright e2e test in `apps/worker/src/*.e2e.test.ts` (Postgres needed: `service postgresql start`, then `TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres`). Useful locators:
  - `.react-flow__node-<type>[data-id="out:banner"]`
  - a node by title: `.react-flow__node` filtered by `.sc-node__title`
  - `.react-flow__edge`, `.react-flow__pane`
  - `getByRole('button', { name: /^Fit to screen/ })` before measuring anything
- Seed a board through the API with core functions (`addOutput`, …) and `page.request.put`, as `comments.e2e.test.ts` does, rather than many UI clicks.
- **CSS changes** must keep `apps/worker/src/css-parity.e2e.test.ts` green during the CSS cleanup (see `test/css-reference/README.md`).

## 9. Checklist: a new node type

1. Model and rules in `packages/core` first (with tests). Model changes need a DECISIONS note.
2. flow.ts: id helpers, a `Node<…>` type, add it to `BoardNode`, build it in `docToNodes` (and edges in `docToEdges`).
3. Component `XNode.tsx`: `NodeHead`, `Handle`s with typed ids, `NO_CANVAS` on controls, `readOnly` respected.
4. Register it in `nodeTypes` (nodes.tsx). Add it to the + Add menu and the right-click menu if users create it.
5. Connections: extend `connectionRefusal` in core, and `onConnect` in Board.tsx if it wires specially.
6. Delete: `delete-nodes.ts`. Zoomed-out tag: `panelTitle` in ZoomLabels. Inspector section if it has settings.
7. Tests: a unit test for the doc ↔ flow mapping, and one e2e test that adds, wires and deletes it.
8. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the tests (with Postgres).

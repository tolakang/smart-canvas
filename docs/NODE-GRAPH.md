# Node graph (D32)

The board becomes a typed node graph. It keeps what works today: inputs, a main preview with ordered layers,
outputs that adapt automatically, overrides, and freezing. It also allows chaining, several compositions, and
layers that only one output gets.

## Node types

| Node | In ports | Out port | What it does |
|---|---|---|---|
| **Input** (image, SVG, text, fill) | none | `layer` | As today: content plus a behaviour (background, subject, text, logo, decoration) |
| **Process** | `layer` | `layer` | Changes a layer without touching the input: Crop, Adjust (opacity, brightness, contrast, saturation, blur), Flip/Rotate, Text variant (replace text and/or style, e.g. a translation), Recolor (fill / SVG colour) |
| **Composition** ("Main preview") | ordered `layer` ports (port 0 = front, D11) | `composition` | As today's main preview: master size, placements, editor. A project can have several (e.g. one per campaign variant). |
| **Output** | `composition` (one), plus ordered `layer` ports (output-only layers) | none | As today: size, preset, bleed, overrides, disconnect = freeze. Output-only layers are laid out by their behaviour, above the composition's layers. |

Later (not in the first tickets): a composition used as a layer of another composition (nesting), with its
output port also offering `layer`.

## Rules

- **Typed wires.** A `layer` out port can feed process, composition and output-layer ports. A `composition` out
  port can feed only an output's composition port. Each in port takes one wire; an out port can feed many.
- **No cycles.** Connecting refuses an edge that would create one. Process chains are evaluated in order: the
  input first, then each process.
- **Effective layer.** What a composition or output port receives is the input's content and behaviour, with
  each process applied in chain order. The board's thumbnails show the effective layer.
- **Layout (D30) per composition.** An output's layout is computed from its composition's master size and
  placements. The effective layers follow the existing rules. Output-only layers get a default placement from
  their behaviour (logo → corner, text → bottom, others → content group) and can be overridden like any layer.
- **Freezing (D12, kept).** Removing an output's composition wire freezes its frames. Reconnecting to the same
  or another composition offers keep / reset overrides.
- **Rendering.** Process effects map to what the DOM renderer draws: CSS `filter`, `clip-path`/object
  position, transforms, and replaced text or colours. Browser preview, browser export and the worker stay
  pixel-identical.

## Model (schema 2)

The types live in `packages/core/src/model.ts` (mirrored in `docs/DATA-MODEL.ts`), and the helpers live in
`packages/core/src/graph.ts`.

```ts
interface Composition { id: string; label: string; size: Size; placements: Record<string, NFrame>; layers: string[]; board: XY }
//   layers = its rows, front first (row index = port, D11); a row draws while a `layer` edge feeds it
type EdgeKind = 'layer' | 'composition';
interface Edge { id: string; from: string; to: string; kind: EdgeKind }   // replaces Wire
interface ProcessNode { id: string; label: string; op: ProcessOp; board: XY }
// OutputNode gains layers?: string[] — its own rows (output-only layers, T12.4), front first
interface ProjectDoc {
  schema: 2; rev: number; name: string;
  compositions: Composition[];   // [0] is 'main' (the v1 master)
  sources: InputSource[];        // no `port` any more: order is per composition
  processes: ProcessNode[];
  outputs: OutputNode[];
  edges: Edge[];
}
```

- **Edge ids** keep the v1 wire ids: `in:<source>` into main, and `out:<output>` from a composition into an output. Other layer edges are `in:<from>><to>`.
- **`connectRefusal(doc, from, to, kind)`** checks port types and refuses cycles.
- **`migrateProjectDoc`** turns v1 into v2:
  - `master` becomes composition `main`, with rows in port order;
  - wires become typed edges with the same ids, and dangling wires are dropped;
  - overrides and frozen frames are kept.
- **The API** migrates on read and accepts v1 or v2 on save (it stores v2). A stored v1 document upgrades on its next save.

The limits are 10 inputs, 10 outputs, 5 compositions (`LIMITS.maxCompositions`) and 20 process nodes (`LIMITS.maxProcesses`).

## Tickets (P12)

1. **T12.1** Model v2 and migration. The core graph helpers (connect / disconnect / validate, cycle check,
   effective-layer resolution) and the API accepting and upgrading v1. The UI keeps working through
   adapters, with no visible change.
2. **T12.2** Board on the typed graph. Handles are coloured by type, and an invalid drop is refused with a hint.
   Generic connect / re-route / detach (generalising T8.5).
3. **T12.3** Several compositions. Add a "Main preview" node, wire outputs to any composition, open an editor
   per composition, and export follows the wire.
4. **T12.4** Output-only layers. Layer ports on output nodes, with default placement by behaviour and overrides.
5. **T12.5** Process nodes I: Crop, Adjust, Flip/Rotate. Includes the renderer and a parity test between
   browser and worker.
6. **T12.6** Process nodes II: Text variant, Recolor.
7. **T12.7** Node palette. Drag a wire out of any port, or right-click, to get the nodes compatible with that
   port (generalising T10.4).
8. **T12.8** Nested compositions (a composition as a layer).

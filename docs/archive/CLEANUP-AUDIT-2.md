# Clean-up audit 2 (2026-10-28)

The second audit of code, tests, docs and UI, after the UX review fixes (#202–#216, D66–D70), at main `3d39d37`.
The audit itself changed nothing. The page with screenshots: https://claude.ai/artifact/3PokYkd1AuN2jTqYXPJwJW
(private; ask the owner). The first audit: `CLEANUP-AUDIT.md` (nothing it handled is repeated here).

Groups: **(1) safe to delete**, **(2) safe to update**, **(3) needs the owner's decision** (anything that touches a
locked decision, DATA-MODEL.ts or a new dependency). Owner, 2026-10-28: "start (1)", then "go group (2)".

**How it was checked**
- **Docs:** CLAUDE.md, 00-READ-FIRST, DECISIONS D1–D70, BACKLOG, TASKS, FRONTEND, TAILWIND-PLAN and UX-REVIEW were read first.
- **Dead code:** knip could not be downloaded here, so a read-only script listed every export in `apps/`, `packages/` and `scripts/` and searched for it everywhere else, tests included.
- **Board:** the react-flow skill's rules, checked file by file.
- **CSS:** every rule, against FRONTEND §1.
- **Tests:** timings from a full worker run.
- **UI:** 25 screenshots of a new project, taken with the e2e stack:
  - the board at Fit and Fit all, keyboard focus, and the inspector for each kind of node;
  - both editors, Export, Review, History, Projects, Size presets and sign-in;
  - dark theme, a tablet and a phone;
  - a DOM sweep for controls under 24 px and controls without a name;
  - reviewed with the design-critique, accessibility-audit, ux-writing and design-systems skills.

**Not covered:** an automated contrast scan (axe would be a new dependency) and a screen reader pass.

## (1) Safe to delete — done in #217

| # | What | Why |
|---|---|---|
| R1 | `layerRule`, `layerRuleText`, `LayerRule` (`packages/core/src/core-rules.ts`) and their test | The Core Auto Layout Guide's text, removed in V2; the engine never called them |
| R2 | `CORE_VERSION` (`packages/core/src/index.ts`) and `index.test.ts` | Scaffold leftover; only its own test read it |
| R3 | `portOf` (`packages/core/src/graph.ts`) | D11 port numbers; tests now ask `layerOrder(…).indexOf(…)` |
| R4 | `toNFrame` (`apps/web/src/editor/geometry.ts`) | No caller since the transform box (D36) |

## (2) Safe to update

Code and tests:

| # | What | Why |
|---|---|---|
| U1 | `isEmpty` in `editor/LayersPanel.tsx` and `core/health.ts` | One `isEmptyLayer` from core: the editors' "empty" tag, the health count and the Export note must agree |
| U2 | `layerHistories` in `MainEditor.tsx` and `OutputEditor.tsx` | One `savedTransforms` in core `transform-history.ts` |
| U3 | Ids parsed by hand in `Board.tsx` (`startsWith('grp:')` ×4) and `ZoomLabels.tsx` | Use the `flow.ts` helpers (react-flow skill §1) |
| U4 | `NO_DRAG = 'nodrag nopan'` in `MainNode.tsx`; raw strings in `RoutedEdge.tsx`, `Board.tsx`, `nodes.tsx` | `NO_CANVAS` from `pinch.ts`, as every other card |
| U5 | A React Flow rule in `styles.css` | React Flow overrides live in `board/chrome.css` (FRONTEND §1) |
| U6 | Pre-D66 names in about 60 code comments and test titles | Comments and test names only; the stored label `'Layer comp'` stays (D66 keeps the model's names) |
| U7 | `css-parity-editors.e2e.test.ts`: 15 screens in one test, ~185 s against a 150 s local limit | Split into three tests |
| U8 | `Board.tsx` is 1,689 lines | Optional: split into hooks; last, if at all |
| U9 | Test helpers that need every panel on screen use Fit to screen | Since D69 it stops at 40 %: use Fit all |

UI fixes that fit the decisions:

| # | What | Finding |
|---|---|---|
| U10 | Copy:<ul><li>"Behaves liketext"</li><li>An empty Logo node's line says "0 pictures … Drop more files"</li><li>Two `KIND_LABEL` sets for the same kinds</li><li>The Preset inspector shows each size twice</li><li>"Delete" beside "Delete node"</li></ul> | N1, N3, N4, N6, N17 |
| U11 | "Fit all" and "Minimap" share the `map` icon | N2 |
| U12 | Targets under 24 px at 100 % zoom: editor layer actions (22 px, 2 px apart), KM / EN (17 px), px / mm, card ⋯, Main Comps ↑ ↓ | N5, N7, N8 (WCAG 2.5.8) |
| U13 | No `<main>` landmark and no skip link on Projects or the board | N9 (WCAG 1.3.1, 2.4.1) |
| U14 | An empty text layer draws no box in the editors | N10 (D68 says the editors draw placeholders) |
| U15 | Size presets lists each family twice, with "Built-in" on every row | N16 (UX review F22) |
| U16 | History and Review are icon-only beside a labelled "Assets" | N14 |
| U17 | One `sc-button` left (Export dialog) beside `sc-btn` | One button component |
| U18 | Zoomed out, the Export Group card has no tag of its own | N13 |
| U19 | A phone board opens with an empty band above the first asset nodes | N12 |

Docs:

| # | What | Why |
|---|---|---|
| U20 | Pre-D66 and pre-D68 wording in README, PRODUCT-SPEC, FRONTEND, DESIGN-SYSTEM, HANDOVER, DEPLOY-DOKPLOY (smoke test "upload to Subject") and the react-flow skill | They contradicted D66 and D68 |
| U21 | HANDOVER (dated 10-26, latest D65), 00-READ-FIRST, TASKS (no P29, "(this PR)" without links) and BACKLOG were behind | Group A and B are done |
| U22 | react-flow skill: `FIT_OPTIONS`, line numbers, nothing on D69 / D70 | It is the board's rulebook |
| U23 | FRONTEND §1 didn't say `styles.css` still holds about 146 shared component rules | State the truth until K3 is decided |
| U24 | UX-REVIEW had no status | A and B done, C on hold, F22 open |
| U25 | This audit saved here | So the next review doesn't repeat it |

## (3) Needs the owner's decision

| # | Question | Recommendation |
|---|---|---|
| K1 | The API still accepts schema 1–3 documents from browsers that haven't reloaded (D56, D61; about 100 lines of `project-doc.schema.ts`) | Drop 1 and 2 now, keep 3 one more round; stored documents still migrate in core |
| K2 | `legacySlots` keeps the D8 shape for 18 e2e files (D68 names it) | Keep it as a test fixture |
| K3 | About 146 shared component rules still CSS in `styles.css` (D65: the existing UI moves area by area) | A "T9" in three PRs with the parity test |
| K4 | T8 (Preflight, unused `sc-` hooks, retire the parity test) | After K3 |
| K5 | D69 leaves out a tag that would overlap another, so some panels have no name zoomed out | Shorten a tag to its card's width instead (changes D69's wording) |
| K6 | A Preview can be approved while every layer is empty (D63) | Allow it, with a note beside Approve |

No item needs a DATA-MODEL.ts change or a new dependency. The UX review's C1–C3 stay separate:
- **C1** (D49, D68) goes after group (2).
- **C3** (D64 / V2, D50, DATA-MODEL.ts) goes after K1.
- **C2** (D57, D49) goes last.

## Checked and kept

- **Exports and files:** no unused exports and no unused files. The 70 exports used only by tests (apart from R1–R4) are a module's public shape or test seams.
- **Leftovers:** no TODO, FIXME, `.only` or skipped tests. The three `eslint-disable` lines and the two start-up `console.log` calls are meant.
- **Retired decisions:**
  - react-moveable appears only in a comment.
  - Process nodes and `output.family` survive only in the core migrations, which stored documents need, and in the API schema (K1).
- **Board rules:** `nodeTypes` and `edgeTypes` are module constants, and no node calls `useNodes()` or `useEdges()`.
- **CSS:** `chrome.css` holds only React Flow's DOM and `editor.css` only the transform box.
- **Docs:**
  - No broken links between docs (`AFFINITY-IMPORT.md` is already noted as never written).
  - `docs/STYLING.md` stays as a pointer, because D65 links it.
  - The spikes stay (first audit, Q3), and the Q6 plan stays on hold.

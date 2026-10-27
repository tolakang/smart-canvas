# Tailwind conversion

Decided: **the web app is built with Tailwind** (D65; owner 2026-10-26: "build with tailwind"). New UI is written in
utilities from the start, following `docs/FRONTEND.md`. This file tracks only the conversion of the CSS written
before that, area by area, with no visual change.

## Status

| PR | Area | CSS it empties | Risk | Done |
|---|---|---|---|---|
| T1 | Setup: packages, `tailwind.css` (tokens, `dark`, breakpoints, layers), parity test, guard, D65 | — | low | ✅ #180 |
| T2a | Dialogs (Export, Rename / New project, Size presets, Team, fonts, library, PDF page, reconnect) | `ui/dialogs.css` | low | ✅ #181 |
| T2b | Projects home, sign-in | `shell/home.css` | low | ✅ #182 |
| T3a | Top bar and menus | their rules in `board/chrome.css` | medium | ✅ #183 |
| T3b | Floating side panels, inspector, project overview, canvas notices | more of `board/chrome.css` | medium | ✅ #185 |
| T3c | Canvas toolbar, selection bar, tooltips, name tags, groups | the rest but React Flow's | medium | ✅ #186 |
| T4a | Main Comps, Export Group, Presets, Preview Cards, their ports and layout health | `board/pipeline.css` | medium | ✅ #187 |
| T4b | The card every node shares: card, header, fields, behaviour picker (React Flow's handles stay CSS) | `board/node.css` | medium | ✅ #188 |
| T5 | Asset nodes and slots (many states) | `board/assets.css` | high | ✅ #189 |
| T6 | History, comments, approval | `board/review.css` | low | ✅ #192 |
| T7a | Editor shell: screen, bar, stage and its overlays, the panels' layout, phone tabs | the shell's rules in `editor/editor.css` | high | ✅ #193 |
| T7b | Editor panels: Layers, Design, override inspector, text properties | more of `editor/editor.css` | high | ✅ #194 |
| T7c | Comments and pins (the transform box stays CSS) | the rest but the transform box | medium | this PR |
| T8 | Optional: Preflight in place of our base styles if parity stays identical; drop `sc-` modifiers no test uses; retire the parity test | part of `styles.css` | medium | |

One PR at a time; merge when CI is green. When an area is done, take its file out of the stylesheet list in
`scripts/check-css.mjs`.

## What stays CSS for good

Tokens, fonts and keyframes (`styles.css`); React Flow's own DOM (pane, wires, minimap, handles, in
`board/chrome.css`; its sheet in the lowest layer, `board/reactflow.css`); the editors' transform box (placed by math);
the artwork renderer (`OutputRenderer`, inline styles, shared by Preview and export).

## How a conversion PR works

1. **Find what the old CSS decides.** The parity test's probe (`apps/worker/src/test/css-winners.ts`) reads every
   element's computed style with the area's sheet on and off, at rest and with :hover / :focus-visible forced:
   `SC_PROBE=<sheet> SC_PROBE_SCOPE=<selector> SC_PROBE_OUT=<file> [SC_PROBE_SCREENS=a,b]`. A property that changes
   becomes a utility on that element; one that doesn't is dead and is dropped. Selectors no screen reaches are checked
   on a small static page.
2. **Convert and delete together.** Utilities arrive and the element's rules (and their `!important`s) go in the same
   PR, never side by side. The `sc-` classes stay in the markup. Write the classes by `docs/FRONTEND.md`, including its
   table of utilities that are not what they look like.
3. **Prove nothing moved.** The parity test draws each screen twice on the same page, with this branch's CSS and with
   main's (`test/css-reference/`, built by `scripts/css-reference.mjs`), and compares computed styles and pixels.
   - **What it compares.** Main's sheet has utilities of its own, so the script also writes `areas.json`: the rules
     this branch removes. While main's draw is made, those elements lose the utility classes they didn't have at main.
     The computed styles compared are those of the converted area: the elements those rules styled, their ancestors and
     their descendants. With no converted sheet, or `SC_PARITY_FULL=1`, every element is compared. The pixel diff
     always covers the whole page.
   - **Timers.** While a screen is compared, timers of 300 ms or more and idle callbacks wait (the project thumbnail,
     autosave, a notice's timeout), so the page doesn't change under the comparison.
   - **Files.** The test is six files, `apps/worker/src/css-parity-{board,cards,editors,dialogs,home,phone}.e2e.test.ts`,
     each with its own stack and seeded project (`test/parity-suite.ts`), so vitest runs them side by side.
   - **New screens.** Add a screen for every state the area has, in the file of its area. Phone screens run as a touch
     device (`hasTouch`, `isMobile`).
   ```
   service postgresql start
   node scripts/css-reference.mjs            # after every change to a stylesheet: main's CSS and areas.json
   cd apps/worker
   export TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres
   # while converting: one file, and only the screens whose name contains a word (the others still run their steps)
   SC_PARITY_ONLY=history,review npx vitest run src/css-parity-board.e2e.test.ts
   # before the PR (and on CI): every file, every screen
   npx vitest run src/css-parity-
   ```
4. `pnpm lint`, `pnpm typecheck`, `pnpm build` clean.

A bug found on the way is copied as it is (the parity test needs the same look) and fixed in its own PR.

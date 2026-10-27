# Tailwind conversion

Decided: **the web app is built with Tailwind** (D65; owner 2026-10-26: "build with tailwind"). New UI is written in
utilities from the start, following `docs/STYLING.md`. This file tracks only the conversion of the CSS written
before that, area by area, with no visual change.

## Status

| PR | Area | CSS it empties | Risk | Done |
|---|---|---|---|---|
| T1 | Setup: packages, `tailwind.css` (tokens, `dark`, breakpoints, layers), parity test, guard, D65 | — | low | ✅ #180 |
| T2a | Dialogs (Export, Rename / New project, Size presets, Team, fonts, library, PDF page, reconnect) | `ui/dialogs.css` | low | ✅ #181 |
| T2b | Projects home, sign-in | `shell/home.css` | low | ✅ #182 |
| T3a | Top bar and menus | their rules in `board/chrome.css` | medium | ✅ #183 |
| T3b | Floating side panels, inspector, project overview, canvas notices | more of `board/chrome.css` | medium | ✅ #185 |
| T3c | Canvas toolbar, selection bar, tooltips, name tags, groups | the rest but React Flow's | medium | |
| T4 | Main Comps, Export Group, Presets, Preview Cards | `board/node.css`, `board/pipeline.css` | medium | |
| T5 | Asset nodes and slots (many states) | `board/assets.css` | high | |
| T6 | History, comments, approval | `board/review.css` | low | |
| T7 | Editors, including phone tabs | most of `editor/editor.css` | high | |
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
   PR, never side by side. The `sc-` classes stay in the markup. Write the classes by `docs/STYLING.md`, including its
   table of utilities that are not what they look like.
3. **Prove nothing moved.** `apps/worker/src/css-parity.e2e.test.ts` draws each screen twice on the same page, with
   this branch's CSS and with main's (`test/css-reference/`, built by `scripts/css-reference.mjs`), and compares every
   computed style and pixel. Main's sheet has utilities of its own, so the script also writes `areas.json` (the rules
   this branch removes); while main's draw is made, those elements lose the utility classes they didn't have at main.
   Add a screen for every state the area has. Phone screens run as a touch device (`hasTouch`, `isMobile`).
   ```
   service postgresql start
   cd apps/worker && TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres timeout 700 npx vitest run src/css-parity.e2e.test.ts
   ```
4. `pnpm lint`, `pnpm typecheck`, `pnpm build` clean.

A bug found on the way is copied as it is (the parity test needs the same look) and fixed in its own PR.

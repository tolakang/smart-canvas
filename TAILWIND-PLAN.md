# Tailwind conversion

Decided: **the web app is built with Tailwind** (D65; owner 2026-10-26: "build with tailwind"). How to write the UI:
`docs/FRONTEND.md`. The conversion of the older CSS is done through T7 (every area, #180–#195; the finished plan and
its history: [`docs/archive/TAILWIND-PLAN-T1-T7.md`](docs/archive/TAILWIND-PLAN-T1-T7.md)). Left:

| PR | Area | CSS it empties | Risk | Done |
|---|---|---|---|---|
| T8 | Optional: Preflight in place of our base styles if parity stays identical; drop `sc-` modifiers no test uses; retire the parity test | part of `styles.css` | medium | |

Until T8 retires it, the parity test below guards any styling PR that should look the same.

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

# Tailwind conversion plan

Status: **approved by the owner 2026-10-26 (D65); T1 in progress.** Written 2026-10-26, after the CSS
cleanup (P27, C1–C12) finished.

Recommendation: the cleanup already gives most of the robustness. Convert only if a lot of new UI is coming; otherwise
stay on plain CSS. Either way, nothing here may change how the app looks.

## Where we start

- 9 plain CSS files in `apps/web/src`, 1,509 lines:
  - `styles.css`: tokens, base, shared components (461 lines)
  - `board/`: `assets.css`, `pipeline.css`, `node.css`, `chrome.css`, `review.css`
  - `editor/editor.css`, `shell/home.css`, `ui/dialogs.css`
- No cascade layers. The import order in `main.tsx` decides ties (area files right after `styles.css`, newest first).
- `pnpm lint` (`scripts/check-css.mjs`) checks: every colour is a token, no unused `sc-` class, each selector styled
  in one file only.
- 23 `!important` left; breakpoints in use: `max-width: 767px` (14×), `min-width: 768px`, `1279/1280px`, `1100px`,
  `900px`; plus `pointer: coarse` (19×), `hover: none` (5×) and `prefers-reduced-motion` (5×).
- The browser tests find 57 elements by `sc-` class.

## Verified facts the plan relies on

| Fact | Checked |
|---|---|
| `@tailwindcss/vite` 4.3.3 supports Vite 8 (peer `^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`); we run Vite 8.3.4 | `npm view` |
| Tailwind 4.3 ships `theme.css`, `utilities.css` and `preflight.css` separately, so it can run without its reset | package contents |
| Tailwind puts its utilities in `@layer utilities`; CSS outside any layer always beats CSS in a layer | CSS cascade spec |
| `@custom-variant`, `@theme inline` and the `pointer-coarse:` variant exist | package source |
| `hover:` only applies on devices that can hover (`@media (hover: hover)`), unlike our plain `:hover` rules | package source |
| `max-md:` is `width < md`, so with `md` = 768px it matches our `max-width: 767px` | default theme |
| `@import '…' layer(name)` for React Flow's sheet works in the Vite build | tried in C12 (`wip-c12a-layers`) |

## Before it starts: the owner's yes

- Two **dev-only** packages: `tailwindcss` and `@tailwindcss/vite`. They run at build time; the browser gets only
  the generated CSS.
- CLAUDE.md allows a new dependency when the PR description says why. Switching the styling approach is still the
  owner's call, so T1 starts only after an explicit yes, adds a DECISIONS entry and gives the reason in its PR.

## Rules for the whole conversion

1. **Same look, proven.** The CSS parity test comes back for the conversion (from git history, retired in C12). It
   draws each screen two ways on the same page and compares every computed style and pixel:
   - **new:** Tailwind plus the CSS that remains;
   - **old:** the full CSS from before the PR, with Tailwind's sheet taken out.

   This works because the markup keeps its `sc-` classes (rule 5).
2. **Same tokens only.** `@theme inline` maps our variables, so `bg-accent` or `border-line` give today's value and
   follow the dark theme. Tailwind's default palette, scales and breakpoints are switched off (`--*: initial`), so
   only our tokens exist. One spacing step is 1px (`--spacing: 1px`), so `p-14` is the 14px our CSS already uses;
   names that would clash with our tokens take Tailwind's (`font-sans`, `shadow-sm` / `md` / `lg` for --shadow-1/2/3).
   The CSS guard also rejects hex colours in `className` (`bg-[#fff]`).
3. **Dark mode stays on `data-theme="dark"`** through `@custom-variant dark`.
4. **Artwork never touched.** `OutputRenderer` keeps its inline styles, so Preview and export stay one rendering
   path. The Khmer and render parity tests must pass unchanged.
5. **`sc-` classes stay in the markup**, modifiers included (`sc-slot--focus`), until the conversion ends. They are the
   browser tests' hooks and the parity test's old draw. States may use `data-*` attributes alongside.
6. **One owner per element.** An element's CSS rules are deleted in the same PR its utilities arrive, never left side
   by side. Its `!important`s go with them (in a layer, our `!important` would beat Tailwind's `!` utilities).
7. **Touch and hover:** `hover:` is plain `:hover` here (`@custom-variant hover` in `tailwind.css`, T2b), as our CSS
   always had it; Tailwind's own only fires on devices that can hover, which changed the phone screens. The
   `hover: none` rules stay, as `[@media(hover:none)]:` variants. The parity test's phone screens run as a touch device
   (Playwright `hasTouch` and `isMobile`, which turn on `pointer: coarse` and `hover: none`).
8. **No Preflight until T8**, because its `img` and `svg` defaults could shift the artwork.
9. **No class helper packages:** a tiny local `cx()` instead of `clsx` or `tailwind-merge`.

## The cascade in T1

```css
@layer reactflow, theme, base, app, utilities;
@import '@xyflow/react/dist/style.css' layer(reactflow);
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
```

All our CSS goes into the one `app` layer, so the import order inside it stays exactly as today. Splitting it into a
layer per area was tried in C12 and flips about 95 rules; one layer flips none of ours.

React Flow's sheet moves under ours. Five of its rules used to win on specificity, so they are copied into
`board/chrome.css` (already drafted on `wip-c12a-layers`):
- no focus outline on a focused node, wire or selection box;
- its colour for a focused wire;
- its colour for a wire being reconnected.

## PRs, in order

| PR | Area | CSS it empties | Risk |
|---|---|---|---|
| T1 | Setup: packages, `@theme inline`, `dark` variant, breakpoints, the layers above, parity test back, guard update, DECISIONS entry. No visual change. | — | low |
| T2a | Dialogs (Export, Rename / New project, Size presets, Team, fonts, library, PDF page, reconnect) | `ui/dialogs.css` | low |
| T2b | Projects home, sign-in | `shell/home.css` | low |
| T3 | Top bar, menus, inspector, side panels, canvas toolbar | most of `board/chrome.css` | medium |
| T4 | Main Comps, Export Group, Presets, Preview Cards | `board/node.css`, `board/pipeline.css` | medium |
| T5 | Asset nodes and slots (many states) | `board/assets.css` | high |
| T6 | History, comments, approval | `board/review.css` | low |
| T7 | Editors, including phone tabs | most of `editor/editor.css` | high |
| T8 | Optional: Preflight in place of our base styles, only if every parity check stays identical; then drop the `sc-` modifier classes no test uses, and retire the parity test again | part of `styles.css` | medium |

How each PR finds what to convert: the parity test's probe (`apps/worker/src/test/css-winners.ts`; run with
`SC_PROBE=<sheet> SC_PROBE_SCOPE=<selector> SC_PROBE_OUT=<file>`) reads every element's computed style with the
area's stylesheet on and off, at rest and with :hover / :focus-visible forced. A property that changes is one the
sheet wins and becomes a utility on that element; one that doesn't change is dead and is dropped. Selectors no
screen reaches are checked the same way on a small static page. Never put a class on an element a rule finds by
having none (`.sc-card button:not([class])`): style it from its parent (`[&>button]:ml-auto`).

The reference is main's built CSS, which already has utilities of its own (`.border`, `.grid`…); drawn on this branch's
DOM, they would style the elements this branch just converted. So `scripts/css-reference.mjs` also writes `areas.json`:
the rules this branch removes. While the reference is drawn, the elements they style lose the utility classes the
app's Tailwind sheet defines, as they were at main (found in T2b: without it the test passed or failed for the wrong
reason).

Tailwind utilities that are not what the old declaration was, and what to write instead:
- `border-0` keeps the border style (`solid`) and colour: for `border: 0` write `[border:0]`;
- `outline-none` sets only the style: for `outline: none` write `[outline:none]`;
- `row-span-2` sets both grid lines: for `grid-row: span 2` write `[grid-row:span_2]`;
- `content-start` is `flex-start`, not `start`; `shadow-*`, `scale-*`, `translate-*` and `drop-shadow-*` compose
  through `--tw-*` variables (extra layers, other properties): write `[box-shadow:…]`, `[transform:…]`, `[filter:…]`;
- two utilities for the same property on one element: which wins is Tailwind's order, not the class order — never
  give one element both (build the list per case, as the Projects tiles do).

Each PR: convert, delete the area's rules, parity test green on every screen, `pnpm lint`, `pnpm typecheck` and
`pnpm build` clean; merge when CI is green; one PR at a time.

Breakpoints (set in T1, `tailwind.css`): `md` 768px, `lg` 901px, `xl` 1101px, `2xl` 1280px (`max-lg:` and `max-xl:` are the old `max-width: 900px` / `1100px` rules, which include those widths). A phone is `max-md:`, a
tablet `md:max-2xl:`, a wide screen `2xl:`; no screen width moves.

## What stays plain CSS for good

About 10–15% of today's CSS:
- the tokens, fonts and keyframes;
- the React Flow overrides (wires, handles, minimap), because its DOM isn't ours to put classes on;
- the transform box handles, because they are placed by math while dragging;
- the artwork renderer, which uses inline styles.

## Cost and trade-off

- 8 PRs, merged one at a time like the cleanup.
- **Gains:**
  - styles sit next to the markup;
  - deleting a component deletes its styles;
  - new UI is faster to build on the fixed scale.
- **Costs:**
  - long class strings on stateful parts (slots, wires);
  - two dev dependencies to keep updated;
  - during the conversion, each element carries both its `sc-` hooks and its utilities;
  - the highest visual-regression risk is in T5 and T7, where the parity test is the guard.

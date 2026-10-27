# Styling the web app (Tailwind, D65)

The web app is styled with **Tailwind CSS 4 utilities on our own design tokens**. Build every new screen, component,
state and fix with utilities in the markup. The tokens and what they mean are in `DESIGN-SYSTEM.md`; the conversion
of the older CSS is tracked in `../TAILWIND-PLAN.md`.

## Where things are

| What | Where |
|---|---|
| Tokens (colours, type, radius, shadow, motion), light and dark | `apps/web/src/styles.css`, `:root` and `:root[data-theme='dark']` |
| Tailwind's theme: which tokens are classes, breakpoints, `dark:` and `hover:` | `apps/web/src/tailwind.css` (imported first in `main.tsx`) |
| Shared class lists | `ui/tw.ts` (dialogs), `ui/Brand.tsx` (brand), `board/topbar.ts` (top bar, menus), `board/panel.ts` (side panels, inspector, History and Review lists), `board/frame.ts` (board frame, notices), `board/card.ts` (the card every node shares), `board/Slot.tsx` (asset slots), `shell/Projects.tsx` (tiles) |
| CSS that stays CSS | `styles.css` (tokens, base, keyframes, shared `sc-` components not converted yet), `board/chrome.css` (React Flow's pane, wires, minimap, handles), `board/reactflow.css` (React Flow's own sheet, lowest layer), fonts |
| Areas not converted yet | `editor/editor.css` (`TAILWIND-PLAN.md`) |

## Writing classes

- **Tokens only.** Tailwind's own palette, sizes and fonts are switched off; only our tokens exist.
  - Colours: `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`,
    `text-danger`… (every colour token in `tailwind.css`). They follow the dark theme by themselves.
  - Text: `text-xs` … `text-xl` (`--fs-*`); radius `rounded-sm` … `rounded-xl` (`--r-*`); `font-sans` (`--font-ui`).
  - Spacing: **one step is 1px** — `p-14` is 14px, `gap-6` is 6px. The `--sp-*` steps: `p-(--sp-2)`.
  - A value with no token: an arbitrary value (`w-[220px]`, `text-[13px]`); a colour with no token: add a token first
    (the lint guard rejects `bg-[#fff]`).
- **Breakpoints:** `max-md:` phone (under 768px), `md:max-2xl:` tablet, `2xl:` wide (1280px+); `max-lg:` 900px and
  narrower, `max-xl:` 1100px and narrower. Touch: `pointer-coarse:`; no hover: `[@media(hover:none)]:`.
- **States:** `hover:` is plain `:hover` (also on touch screens, as before), `focus-visible:`, `disabled:`,
  `aria-pressed:`, `group-hover/<name>:` with `group/<name>` on the parent. When two state rules compete, write the
  selector out so the weightier one wins: `[&:hover:not(:disabled)]:` beats `aria-pressed:`.
- **Dark mode** comes from the tokens; `dark:` (our `data-theme`, D34) only for a real difference.
- **Pseudo-elements:** `after:`, `before:`, `backdrop:` (a dialog's dimmed page).
- **Lists:** build a component's classes in one place (a constant or a small function next to it, `ui/tw.ts` when
  shared) and never give one element two utilities for the same property: which wins is Tailwind's order, not yours.
- **No class helper packages** (`clsx`, `tailwind-merge`); join strings.

## Tailwind utilities that are not what they look like

| You mean | Don't | Write |
|---|---|---|
| `border: 0` | `border-0` (keeps the style and colour) | `[border:0]` |
| `outline: none` | `outline-none` (style only) | `[outline:none]` |
| a circle | `rounded-full` (a huge length) | `rounded-[50%]` |
| `grid-row: span 2` | `row-span-2` (both lines) | `[grid-row:span_2]` |
| `justify-self: start` / `align-content: start` | `justify-self-start`, `content-start` (`flex-start`) | `[justify-self:start]`, `[align-content:start]` |
| a shadow, transform, filter, backdrop blur | `shadow-*`, `scale-*`, `translate-*`, `drop-shadow-*`, `backdrop-blur-*` (they add `--tw-*` layers) | `[box-shadow:…]`, `[transform:…]`, `[filter:…]`, `[backdrop-filter:…]` |
| `font-size: 0` | `text-[0]` (ambiguous) | `text-[length:0px]` |
| `padding: 0 12px` on a button | `px-12` alone (keeps the browser's 1px) | `px-12 py-0` |
| a border on one side | `[border:0] [border-top:…]` (two properties, Tailwind's order) | `[border-width:1px_0_0] [border-style:solid_none_none] [border-color:…]` |
| a class with `__` in a variant's selector | `[.sc-a>.sc-a__item:first-of-type_&]:` (`_` is a space: `.sc-a item`) | a selector without underscores (`[.sc-a>span:first-of-type_&]:`), or `\_` in a `String.raw` string (`` String.raw`[.react-flow\_\_node.selected_&]:…` ``, board/card.ts) |
| a class built in a template (`` `group-hover/slot:${FILL}` ``) | (never generated: Tailwind reads the source text, not the running code) | the whole class written out in a string (`Slot.tsx`) |
| a shorthand and a longhand on one element (`[border:1.5px_dashed_…] border-accent`) | (their order in the CSS is Tailwind's, not yours) | longhands only (`border-[1.5px] border-dashed border-accent`) |

## Rules

1. **No new CSS rules** for our own markup. New `.css` files fail `pnpm lint`. CSS stays only for tokens, keyframes,
   React Flow's own DOM (`.react-flow__*`, its sheet in `board/reactflow.css`), the editors' transform box (placed by
   math) and the artwork renderer (`OutputRenderer`, inline styles; Preview and export share it).
2. **Keep the `sc-` classes** in the markup (`sc-slot`, `sc-slot--focus`…): the browser tests find elements by them.
   They carry no styles once their area is converted.
3. **Never put a class on an element a rule finds by having none** (`.sc-card button:not([class])`): style it from
   its parent (`[&>button]:ml-auto`, `[&_input]:h-42`).
4. **Accessible names and roles stay** when restyling.
5. Borrowing from **React Flow UI** (shadcn) means rewriting every class: our 1px spacing, our tokens, no shadcn
   names or `cn()` (`.claude/skills/react-flow/SKILL.md` §6).

## Checks

- `pnpm lint` runs `scripts/check-css.mjs`: no hex colour outside a token (in CSS and in classes), no unused `sc-`
  class in CSS, each selector in one stylesheet, no `-webkit-backdrop-filter` (the build adds it), no new `.css` file.
- While areas are being converted, the parity test (`apps/worker/src/css-parity-*.e2e.test.ts`) proves a conversion
  PR changes nothing (`TAILWIND-PLAN.md`). A PR meant to look different is not a conversion PR.

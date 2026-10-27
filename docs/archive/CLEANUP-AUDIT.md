# Clean-up audit (2026-10-27)

Audit of code, dependencies and docs after the Tailwind conversion (P28 T1–T7). Nothing was changed by the audit.
Groups: **(1) safe to delete**, **(2) safe to update**, **(3) unsure — the owner's call**. Each line gives its
reason and its proof. Groups (1) and (2) are done in small PRs by kind; (3) waits for the owner.

How it was checked: `npx knip@5` (run once, not added to the repo), `tsc` (`pnpm typecheck`), `pnpm lint`, and a
search for every candidate across `apps/web`, `apps/api`, `apps/worker` (e2e tests included), `packages/*` and
`scripts/`.

## (1) Safe to delete

| # | What | Reason | Proof |
|---|---|---|---|
| D1 | `cross()` in `apps/web/src/editor/transform/math.ts` | Dead code | knip: unused export; the name appears once in its file (its declaration) and nowhere else in the repo |

Nothing else qualifies: knip finds no unused files and no unused dependencies (its three hits are false positives,
see "Checked and kept"); no commented-out code, no TODO / FIXME, no `debugger`, no skipped tests (`.skip` / `.only`),
no temp or debug files tracked in git.

## (2) Safe to update

Code (no change in how the app looks or behaves):

| # | What | Reason | Proof |
|---|---|---|---|
| U1 | `NO_CANVAS = 'nodrag nopan nowheel'` is declared in 12 files under `apps/web/src/board/` | Duplicated helper | Same text in AssetsNode, GroupNode, HeadlineNode, HealthBadge, NodeHead, OutputNode, OutputSettings, PresetNode, Slot, TextNode, editors, nodes; one export (next to `TOUCH_NO_PAN` in `pinch.ts`) gives the same string |
| U2 | `KIND_LABEL` (`{ image: 'Image', vector: 'SVG', text: 'Text', fill: 'Fill' }`) in 3 files | Duplicated helper | Identical in `board/LibraryDialog.tsx`, `editor/DesignPanel.tsx`, `editor/LayersPanel.tsx` |
| U3 | `MIN_SCALE = 0.02` in `editor/CanvasEditor.tsx` and exported from `editor/transform/math.ts` | Duplicated constant | Same value; CanvasEditor can import it |
| U4 | Three utilities written right after `${…}`: `hover:bg-surface-2${` (`Slot.tsx`), `gap-10${` (`HeadlineNode.tsx`), `p-0${` (`TextNode.tsx`) | Tailwind can't read a class glued to `${`; they work only because the same classes appear elsewhere | Each is in the built CSS today, so adding the space changes nothing (FRONTEND.md §2) |

Docs:

| # | What | Reason | Proof |
|---|---|---|---|
| U5 | `README.md`: "Core Rule", "backlog P1–P24 done", `pnpm lint # eslint`, `pnpm build # build (web)` | Outdated | Renamed Core preset in V2 (D64); P25–P28 done; lint also runs `check-css.mjs`; build runs every workspace |
| U6 | `CLAUDE.md` line 3: "Layer Comp + Core Rule" | Outdated | Renamed Core preset (V2, D64) |
| U7 | `TASKS.md` **Next**: "P28 (Tailwind conversion) is in progress" | Done but not said | T1–T7 merged (#180–#195); T8 is optional |
| U8 | `docs/BACKLOG.md` ends at P24 | TASKS has P25–P28 (UI refresh, asset nodes, CSS cleanup, Tailwind); BACKLOG has no entry for them | Compare section headings |
| U9 | `TAILWIND-PLAN.md`: the T1–T7 table and its history | Finished plan | All ticked ✅; move the finished part to `docs/archive/TAILWIND-PLAN-T1-T7.md`, keep the root file for T8, "what stays CSS" and the parity how-to (still in use until T8) |
| U10 | `docs/BACKLOG.md` S1 names `AFFINITY-IMPORT.md` | A file that was never written (S1 dropped, D6) | No such file in git; note it as never written |
| U11 | `docs/DECISIONS.md`: D49 has no note that D56 superseded part of it; D47 has no note for D56 (stored node retired) or D64/V2 (now "Core preset"); D33's touch long-press has no note for D57 / D58 | Superseded entries not marked | D56 says it "supersedes the part of D49 that kept them … and D47's stored node"; D57 "amends D33"; entries only get a "superseded by / amended by Dxx" mark, never a rewrite |

## (3) Unsure — the owner's call

| # | What | Why it needs you |
|---|---|---|
| Q1 | 248 `sc-` classes (of 393) that no test, CSS rule or selector reads (list below) | T8 says "drop `sc-` modifiers no test uses". Drop them now, in their own PR, or leave them for T8? They cost nothing at runtime; they help reading the DOM |
| Q2 | 28 exports and 34 exported types used only inside their own file (knip) | Dropping `export` changes nothing; many are a module's public shape or used by its tests. My advice: leave them |
| Q3 | `docs/spikes/S2-KHMER-PARITY.md`, `S3-SVG-OUTLINES.md` | Finished investigations, still cited by 00-READ-FIRST as background. Move to `docs/archive/` or keep? |
| Q4 | Helpers repeated across packages: the grapheme `Intl.Segmenter` (web, core, worker ×4), `EXPORT_QUEUE` (api and worker), small route schemas in the API (`uuid`, `projectParams`, `nameSchema`) | Sharing them means a cross-package import; the copies are one line each. My advice: leave them |
| Q5 | T8 (optional): Preflight, drop unused `sc-` hooks, retire the parity test, `apps/worker/src/test/css-reference/`, `css-winners.ts` | The parity test stays until T8 (your rule). Schedule T8, or drop it and keep the parity test as a guard? |
| Q6 | A lint check in `scripts/check-css.mjs` for a class glued to `${…}` | The parity test caught this twice (T7a, T7b). New code, so not clean-up |
| Q7 | In the editors, `.sc-fig` sets `--line: var(--fig-line)` while `--fig-line: var(--line)` (same for `--muted`) | A loop that makes both values invalid inside the editors, so some borders and muted text there don't show as intended. Fixing it is a visible change (its own PR), not clean-up |

### Checked and kept (false positives)

- `docs/DATA-MODEL.ts` (knip: unused file): the spec's model, copied into `packages/core` (CLAUDE.md).
- `scripts/css-reference.mjs` (knip: unused file): run by hand for the parity test.
- `@fontsource/noto-sans-khmer` in `apps/worker` (knip: unused dependency): `khmer-layout.test.ts` and `outline.e2e.test.ts` read its font files.
- `@types/*`, `tsx` (no import): used by the compiler and by the API's package scripts.
- `console.log` in `apps/worker/src/main.ts` and `apps/api/src/db/migrate-cli.ts`: start-up messages, meant.
- Historical ticks in `TASKS.md` naming deleted stylesheets (`board/assets.css`…): the history of done tickets.
- No broken relative links between docs.

### Q1: `sc-` classes nothing reads, by file (`apps/web/src/`)

- `board/AssetsNode.tsx`: `sc-assets`, `sc-assets__item`, `sc-dropzone__icon`, `sc-dropzone__text`, `sc-node--assets`
- `board/Board.tsx`: `sc-inspector`, `sc-theme`, `sc-topbar__review`
- `board/CanvasToolbar.tsx`: `sc-canvasbar__btn`, `sc-canvasbar__item`, `sc-canvasbar__sep`, `sc-canvasbar__zoom`, `sc-tip`, `sc-tip__key`, `sc-tip__name`, `sc-tip__text`
- `board/ExportDialog.tsx`: `sc-export`, `sc-export__jobs`, `sc-export__where`
- `board/GroupNode.tsx`: `sc-group--collapsed`, `sc-group__actions`, `sc-group__count`, `sc-group__swatch`, `sc-rename`
- `board/HeadlineNode.tsx`: `sc-hl`, `sc-node--headline`, `sc-switch`, `sc-switch__on`
- `board/HealthBadge.tsx`: `sc-health__count`, `sc-health__dot`, `sc-health__list`
- `board/HistoryPanel.tsx`: `sc-history__name`
- `board/Inspector.tsx`: `sc-assets__item--focus`
- `board/LibraryDialog.tsx`: `sc-lib__img`, `sc-lib__name`, `sc-lib__swatch`, `sc-lib__text`
- `board/MainNode.tsx`: `sc-comp`, `sc-comp__group--drop`, `sc-comp__groups`, `sc-comp__label`, `sc-comp__layouts`, `sc-comp__moves`, `sc-rule__chip`, `sc-rule__chip--chosen`, `sc-rule__chips`, `sc-rule__empty`, `sc-rule__section-count`, `sc-rule__section-drop`, `sc-rule__section-drop--over`, `sc-rule__section-title`, `sc-rule__sections`
- `board/OutputNode.tsx`: `sc-main`, `sc-node__meta`, `sc-node__overrides`, `sc-output__frozen`, `sc-preview__review`
- `board/OutputSettings.tsx`: `sc-output__row`, `sc-output__settings`
- `board/PresetNode.tsx`: `sc-port--drop`, `sc-port--frozen`, `sc-port--wired`, `sc-port__label`, `sc-ports`, `sc-preset__add`, `sc-preset__add-custom`, `sc-preset__custom`, `sc-preset__eye`, `sc-preset__family`, `sc-preset__note`, `sc-preset__remove`, `sc-preset__rows`, `sc-preset__save`
- `board/ReviewPanel.tsx`: `sc-review__row`
- `board/RoutedEdge.tsx`: `sc-wire`
- `board/Slot.tsx`: `sc-slot--dimmed`, `sc-slot--focus`, `sc-slot--over`, `sc-slot__act`, `sc-slot__act--danger`, `sc-slot__caption`
- `board/TextNode.tsx`: `sc-assets__item--hidden`, `sc-node--text-node`, `sc-text`
- `board/ZoomLabels.tsx`: `sc-zlabel`, `sc-zlabel__mark`, `sc-zlabel__mark--ok`, `sc-zlabel__name`, `sc-zlabel__tag`
- `board/card.ts`: `sc-head`, `sc-head__icon`, `sc-head__sub`, `sc-head__text`, `sc-head__title`, `sc-node--drop`, `sc-node--frozen`, `sc-node--hidden`, `sc-node__mark`
- `board/frame.ts`: `sc-board__canvas`, `sc-board__restore`, `sc-board__version-actions`, `sc-guide--h`, `sc-selbar`, `sc-selbar__count`
- `board/nodes.tsx`: `sc-behavior`, `sc-node__busy`, `sc-node__text`
- `board/panel.ts`: `sc-floating`, `sc-floating--end`, `sc-floating--overlay`, `sc-floating--sheet`, `sc-floating__head`, `sc-history__day`, `sc-history__item`, `sc-history__item--on`, `sc-history__note`, `sc-history__title`, `sc-overview__name`, `sc-overview__stats`, `sc-overview__tips`
- `board/pinch.ts`: `sc-touch`
- `board/topbar.ts`: `sc-board__bar`, `sc-menu`, `sc-menu__item`, `sc-menu__item--danger`, `sc-menu__item--sep`, `sc-menu__title`, `sc-save`, `sc-save__dot`, `sc-save__long`, `sc-save__short`, `sc-topbar__add`, `sc-topbar__count`, `sc-topbar__counts`, `sc-topbar__end`, `sc-topbar__ghost`, `sc-topbar__group`, `sc-topbar__icon`, `sc-topbar__name`, `sc-topbar__primary`, `sc-topbar__sep`
- `editor/CommentsPanel.tsx`: `sc-comments__primary`
- `editor/DesignPanel.tsx`: `sc-design__value`
- `editor/OutputEditor.tsx`: `sc-approval`, `sc-approval--changed`, `sc-approval--on`, `sc-approval__approve`, `sc-approval__state`
- `editor/panels.ts`: `sc-comment`, `sc-comment__actions`, `sc-comment__resolved`, `sc-comment__text`, `sc-comments__compose`, `sc-comments__compose-actions`, `sc-comments__list`, `sc-comments__reply-btn`, `sc-comments__thread--on`, `sc-comments__thread--resolved`, `sc-comments__toggle`, `sc-design__grid`, `sc-design__keys`, `sc-design__lock`, `sc-design__num`, `sc-design__shortcuts`, `sc-design__shortcuts--touch`, `sc-design__touch`, `sc-edited`, `sc-editor__side`, `sc-gestures`, `sc-inspector__actions`, `sc-inspector__table`, `sc-layer--drop`, `sc-layer--hidden`, `sc-layer--unwired`, `sc-layer__actions`, `sc-layers__list`, `sc-pin--new`, `sc-pin--on`, `sc-pin--resolved`, `sc-props`, `sc-props__body`, `sc-props__note`, `sc-props__row`
- `editor/shell.ts`: `sc-editor__body`, `sc-editor__pan`, `sc-editor__point`, `sc-editor__size`, `sc-editor__spot`, `sc-fig__close`, `sc-fig__count`, `sc-fig__selection`, `sc-fig__tool`, `sc-fig__tool--comment`, `sc-fig__tools`, `sc-sheet`, `sc-zoom`, `sc-zoom__actual`, `sc-zoom__value`
- `fonts/FontsDialog.tsx`: `sc-font__name`, `sc-font__sample`, `sc-fonts`
- `fonts/loader.ts`: `sc-team`
- `shell/PresetsDialog.tsx`: `sc-families`, `sc-family`, `sc-family__sizes`, `sc-lede`
- `shell/Projects.tsx`: `sc-empty`, `sc-home`, `sc-home__bar`, `sc-home__count`, `sc-home__filters`, `sc-home__head`, `sc-home__lede`, `sc-home__nav`, `sc-home__new-btn`, `sc-home__team`, `sc-home__team-chip`, `sc-home__title`, `sc-home__tools`, `sc-newproj`, `sc-newproj__from`, `sc-tcard__main`, `sc-tcard__name`, `sc-tcards`, `sc-tile`, `sc-tile--lg`
- `shell/SignIn.tsx`: `sc-auth`, `sc-auth__art`, `sc-auth__brand`, `sc-auth__card`, `sc-auth__frame`, `sc-auth__frame--a`, `sc-auth__frame--b`, `sc-auth__frame--c`, `sc-auth__frame--d`, `sc-auth__head`, `sc-auth__password`, `sc-auth__pitch`, `sc-auth__show`, `sc-auth__switch`
- `shell/TeamDialog.tsx`: `sc-invite`
- `ui/Brand.tsx`: `sc-auth__mobile-brand`, `sc-brand`, `sc-brand__mark`
- `ui/PdfPageDialog.tsx`: `sc-pdfpages`, `sc-pdfpages__blank`, `sc-pdfpages__grid`
- `ui/tw.ts`: `sc-dialog__foot`

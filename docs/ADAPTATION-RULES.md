# ADAPTATION-RULES (layout engine v2 — content fit, D30)

Package: `packages/core/src/layout`. Pure and deterministic. Signature:

```ts
computeLayout(doc: ProjectDoc, outputId: string, deps: { measure: TextMeasure; assets: Record<string,{width:number;height:number}> }): LayoutResult
type TextMeasure = (text: string, fontPx: number, style: TextStyle) => number  // width in design px
interface LayoutItem { sourceId: string; frame: Frame; fontSizePx?: number; lines?: string[]; overridden: boolean; warnings: ('text-overflow'|'min-logo'|'clamped')[] }
interface LayoutResult { metrics: CanvasMetrics; family: 'stack'|'side'; items: LayoutItem[] }   // items ordered back→front (highest port first)
```
Overrides are applied last (frame fields replace computed ones). Hidden sources are skipped.

## Definitions
- Master canvas `Wm×Hm` (design px). Output trim `Wt×Ht`, bleed `b`, full canvas `W=Wt+2b, H=Ht+2b`, safe rect `S` (see `canvasMetrics`).
- `k = min(Wt/Wm, Ht/Hm)` — uniform contain-scale of master onto trim (v1's only scale; still the lower bound and the logo scale).
- `K = max(Wt/Wm, Ht/Hm)` — cover-scale of master onto trim (upper bound of the content scale).
- Source master frame `F` (from `NFrame`×master). Anchor `(ax, ay)` = centre of `F` normalized 0..1.
- Ratio `r = Wt/Ht`. Family: `output.family` if not 'auto'; else `side` when `r ≥ 1.3`, otherwise `stack`.
- Layer order = ports (0 front). Rendering order = back→front.

## Content groups (v2)
The layers that carry the design are fitted **as a group** into the output's free space, instead of shrinking the whole master canvas into it (v1). A group is the master frames of the visible, wired, placed sources of some behaviours; overrides don't change a group (they apply last).
- **Regions.** stack → one group of subjects, decorations and texts in `R = S`. side → visuals (subjects + decorations) in the right half of `S`, texts in a column in the left half; a side output with only visuals or only texts gives that group all of `S`.
- **Union** `U` = bounding box of the group's master frames.
- **Size scale** `c = clamp(min(R.w/U.w, R.h/U.h), k, max(k, K))` — the group fills `R`, never smaller than v1 and never larger than the master's cover.
- **Spread** `px = max(c, R.w/U.w)`, `py = max(c, R.h/U.h)`. A master frame `F` maps to size `F.w·c × F.h·c` centred at `(R.cx + (F.cx − U.cx)·px, R.cy + (F.cy − U.cy)·py)`. Distances grow at least as much as sizes, so layers that don't overlap on the master don't overlap in the output; an output much taller or wider than the master is used edge to edge.

## Rules by behaviour
**background (image)** — cover on the full canvas (incl. bleed).
`s = max(W/iw, H/ih)`; size `iw·s × ih·s`; `left = clamp(W/2 − fx·iw·s, W − iw·s, 0)`; `top = clamp(H/2 − fy·ih·s, H − ih·s, 0)` where `(fx,fy)` = focal point.
**background (fill)** — rect `0,0,W,H`.

**subject** — mapped by its group (size `F·c`, spread centre).
- Then fit into `S`: if larger, scale down by `min(S.w/w, S.h/h)`; translate to stay inside `S` (add warning `clamped` if moved/scaled).

**decoration** — same as subject but no clamp (may bleed off edges).

**logo** — not in a content group (unchanged from v1). Size `F.w·k × F.h·k`; enforce min width `minLogoWidthPct% · min(Wt,Ht)` keeping aspect (warning `min-logo` if enforced). Corner = nearest to master centre of `F` (`ax<0.5` left else right; `ay<0.5` top else bottom). Placed flush to that corner of `S`.

**text** — fit-to-box.
1. Start size `f0 = style.fontSizePx · c` (its group's size scale).
2. Box (stack): width `bw = min(F.w·px, R.w)` (it widens with the layout), height `bh = min(F.h·c, R.h)`, centred at the text's spread centre. Side family: the column (left half of `S`, or all of `S` without visuals), `bh = min(F.h·c, S.h)`.
3. Break lines with greedy word wrap. Khmer (language km, or auto-detected when text contains U+1780–17FF): break only at `Intl.Segmenter('km',{granularity:'word'})` boundaries; never inside a word unless a single word is wider than `bw` (then fall back to grapheme breaks). Latin: break at spaces.
4. Result font = largest size on a 0.5 px grid, `≤ f0` and `≥ minFontPx`, such that `lines ≤ maxLines` and `lines·size·lineHeight ≤ bh`. If even `minFontPx` fails → use `minFontPx`, set warning `text-overflow`.
5. Line height default: 1.2 latin, 1.6 khmer (tunable constants in `rules.config.ts`).
6. Position: stack → the box above; then clamp into `S`. Text alignment from style.
7. **side family**: all text sources form one column (`x = column.x`, `w = column.w`), stacked in master top→bottom order with gap `2%·Ht`; block is vertically centred in `S`. If the block is taller than `S.h`, scale all font sizes by `S.h/blockHeight` (not below `minFontPx`).
8. Override rule: if `override.style.fontSizePx` exists, use it as-is (no fit). If only `override.frame` exists, fit still runs inside that frame.

## Output-only layers (T12.4, D32)
An output's own `layer` ports (`output.layers`, front first) are drawn **above** the composition's layers, back→front, while a `layer` edge feeds them. They are not in a content group and don't move the composition's layers. A source the composition already draws is skipped here (the composition wins). Overrides, `hidden` and frozen frames apply as for any layer. Default frames, in the output's canvas:
- **background** — as above (cover / full rect).
- **logo** — top-right corner of `S`; width `max(0.15·min(S.w,S.h), minLogoWidthPct%·min(Wt,Ht))`, height by the asset's aspect (square if unknown).
- **text** — a full-width band over the bottom quarter of `S`: `{S.x, S.y + 0.75·S.h, S.w, 0.25·S.h}`; fit-to-box starting at `fontSizePx·k`.
- **subject / decoration** — contain-fit of the asset's aspect (square if unknown) into `0.6·S.w × 0.6·S.h`, centred in `S`.

## Worked examples (must be unit tests)
Mock measure for tests: `width = text.length · 0.5 · fontPx`.

**A. Subject alone, stack.** Master 3000×3000; only the subject is wired, frame `{x:900,y:750,w:1200,h:1800}`. Output 1080×1350 px, no bleed: `S={54,54,972,1242}`, `k=0.36`, `K=0.45`.
`U=F`; `c = clamp(min(0.81, 0.69), 0.36, 0.45) = 0.45` → 540×810, centred in `S` at (540, 675) → frame `{x:270, y:270, w:540, h:810}`. (v1: `{324, 418.5, 432, 648}`.)

**G. Subject + headline, stack.** As A, plus the headline wired at its default `{x:240,y:2280,w:2520,h:480}`.
`U = {240,750,2520,2010}`; `c = px = 972/2520 = 0.385714`; `py = 1242/2010 = 0.617910`; `U` centre (1500, 1755).
- subject: centre (540, 675 + (1650 − 1755)·py) → `{x:308.571429, y:262.976546, w:462.857143, h:694.285714}`.
- headline box: `w = min(2520·px, 972) = 972`, `h = 480·c = 185.142857`, centre y `675 + 765·py` → `{x:54, y:1055.130064, w:972, h:185.142857}`; `f0 = 160·c`.

**B. Subject, side (wide).** Same master/subject, headline wired. Output 3000×1000 px, family auto (r=3 → side); `S={x:50,y:50,w:2900,h:900}`, `k=1/3`, `K=1`.
Visuals get the right half `R = {1500,50,1450,900}`: `c = min(1450/1200, 900/1800) = 0.5` → 600×900 centred in `R` → `{x:1925, y:50, w:600, h:900}`. Without the headline the subject gets all of `S` → `{x:1200, y:50, w:600, h:900}`. (v1: `{2025, 250, 400, 600}`.)

**H. Small artwork in extreme formats.** Only a subject `{300,300,1000,1000}` (a badge). Story 1080×1920: `c = clamp(min(972/1000, 1812/1000), 0.36, 0.64) = 0.64` → `{x:220, y:640, w:640, h:640}`. Banner 1200×630: `c = clamp(min(1137/1000, 567/1000), 0.21, 0.4) = 0.4` → `{x:400, y:115, w:400, h:400}`. (v1 kept it at `k`: 360 and 210 px.)

**C. Background cover with focal.** Image 4000×3000, focal (0.7, 0.4). Output 1080×1350, no bleed.
`s = max(0.27, 0.45) = 0.45` → 1800×1350; `left = clamp(540 − 0.7·1800, −720, 0) = −720`; `top = clamp(675 − 0.4·1350, 0, 0) = 0` → frame `{x:−720, y:0, w:1800, h:1350}`.

**D. Logo.** Master logo frame `{x:150,y:150,w:400,h:200}` (top-left). Output 1080×1350: `k=0.36` → 144×72; min width `8%·1080 = 86.4` ok; placed at S corner `S.x=S.y=54` → `{x:54,y:54,w:144,h:72}`. Output 3000×1000: `k=1/3` → 133.33×66.67 at `{x:50,y:50}`.

**E. Text fit.** Master 3000², headline frame `{x:300,y:300,w:2400,h:500}`, font 200, text `"AAAAA BBBBB CCCCC DDDDD EEEEE"` (29 chars), default subject `{600,360,1800,1800}` also wired. Output 1080×1350, stack.
`U = {300,300,2400,1860}`; `c = px = 972/2400 = 0.405`, `py = 1242/1860`; `f0 = 81`, `bw = 972`, `bh = 202.5`; box `{x:54, y:119.685484, w:972, h:202.5}`.
- maxLines 2 → **81 px**, 2 lines (4 words + 1), height 194.4 ≤ 202.5.
- maxLines 1 → largest 0.5-step with `29·0.5·f ≤ 972` → **67 px**, 1 line.

**I. Output-only layers.** Output 1080×1350 px, no bleed: `S={54,54,972,1242}`, `k=0.36`.
- Logo, asset 400×200: `w = max(145.8, 86.4) = 145.8`, `h = 72.9` → `{x:880.2, y:54, w:145.8, h:72.9}`.
- Text "SALE", font 200: band `{x:54, y:985.5, w:972, h:310.5}`; fit starts at 72 px and fits on one line → **72 px**.
- Subject, asset 1000×500: `w = min(583.2, 745.2·2) = 583.2`, `h = 291.6` → `{x:248.4, y:529.2, w:583.2, h:291.6}`.
- Each is drawn after (above) every composition layer; with an override frame `{x:10}` the logo is at `x:10`.

**F. Export size.** A4 210×297 mm, 300 dpi: trim 2480×3508 px; with 3 mm bleed (216×303 mm) 2551×3579 px. 1080×1350 px at scale 2 → 2160×2700.

## Sync rules (summary of D20/D21)
- Master/input edit → every connected output recomputes; overrides stay.
- Disconnect → store `output.frozen` = current computed frames (+ font sizes). While `frozen` exists, `computeLayout` returns those frames (overrides still applied on top) and ignores master/layout changes; content (text, images) still updates. Reconnect deletes `frozen`.
- Reconnect → no overrides: recompute silently. Overrides exist: dialog [Keep overrides · Reset all · Cancel].
- "Reset layer" removes that override; "Reset output" clears all overrides of the output.

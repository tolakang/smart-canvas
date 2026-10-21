# ADAPTATION-RULES (layout engine v3 — the stretched grid, D38)

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
- Axis ratios `sx = Wt/Wm`, `sy = Ht/Hm`; `k = min(sx, sy)` — the uniform contain-scale of master onto trim; `g = √(sx·sy)` — the grid scale: a cell of the stretched grid keeps its area share at `g²`.
- Source master frame `F` (from `NFrame`×master).
- Ratio `r = Wt/Ht`. Family: `output.family` if not 'auto'; else `side` when `r ≥ 1.3`, otherwise `stack`. v3 reports the family but places every family the same way.
- Layer order = ports (0 front). Rendering order = back→front.

## The stretched grid (v3)
Think of the master canvas as a grid of coordinates `(u, v)`, 0..1 across and down. In an output the grid stretches to the trim: `(u, v)` lands at `(b + u·Wt, b + v·Ht)`. Each layer is pinned to the grid and stays on its coordinate; layers are placed one by one, never as a group.
- **Pin, per axis.** By where the centre of `F` sits on the master: first third → the layer's start edge (left / top), middle third → its centre, last third → its end edge (right / bottom). So a layer near an edge keeps its distance to that edge in grid units; a layer in the middle keeps its centre.
- **Fill, per axis.** A layer *fills* an axis when it reaches within 0.5% of both master edges (or past them). A filled axis pins the centre.
- **Scale `c`.** Fills both axes → `max(sx, sy)` (it covers the output); fills only x → `sx`; fills only y → `sy`. Otherwise the layer scales with the grid: `c = min(g, room)`, never below `k`. At `g` the layer covers the same share of the canvas as its stretched grid box (`F.w·sx × F.h·sy`), so it keeps its visual weight in tall and wide outputs. One scale for both axes, so pictures and text keep their proportions.
- **Room.** On each axis where the layer lies inside the master, the scale is capped so the layer, hung from its pin, stays inside the trim: pinned start at `X` → `(Wt − X)/F.w`; end → `X/F.w`; centre → `2·min(X, Wt − X)/F.w` (same for y). A layer hanging off a master edge has no cap on that axis. At `k` a layer inside the master always fits, so `room ≥ k`.
- **Frame.** Size `F.w·c × F.h·c`; on each axis the pin point (master coordinate `a = F.lo + p·F.size`, `p` = 0, ½ or 1) lands at `b + (a/Wm)·Wt` and the frame hangs from it: `x = b + (a/Wm)·Wt − p·w` (same for y). Rotation, skew and `fitted` are kept.
- A layer inside the master stays inside the trim (the room cap). There is no safe-area clamp.

## Rules by behaviour
**background (image)** — cover on the full canvas (incl. bleed).
`s = max(W/iw, H/ih)`; size `iw·s × ih·s`; `left = clamp(W/2 − fx·iw·s, W − iw·s, 0)`; `top = clamp(H/2 − fy·ih·s, H − ih·s, 0)` where `(fx,fy)` = focal point.
**background (fill)** — rect `0,0,W,H`.

**subject / decoration** — on the stretched grid (above). A decoration hanging off a master edge hangs off the output edge too.

**logo** — on the stretched grid, then a minimum width `minLogoWidthPct% · min(Wt,Ht)`: if `F.w·c` is smaller, `c = minW/F.w` (aspect kept, warning `min-logo`); the logo grows away from its pin, so a corner logo stays in its corner.

**text** — fit-to-box.
1. Start size `f0 = style.fontSizePx · c` (the box's grid scale).
2. Box: the master text box on the stretched grid (above), `bw × bh`.
3. Break lines with greedy word wrap. Khmer (language km, or auto-detected when text contains U+1780–17FF): break only at `Intl.Segmenter('km',{granularity:'word'})` boundaries; never inside a word unless a single word is wider than `bw` (then fall back to grapheme breaks). Latin: break at spaces.
4. Result font = largest size on a 0.5 px grid, `≤ f0` and `≥ minFontPx`, such that `lines ≤ maxLines` and `lines·size·lineHeight ≤ bh`. If even `minFontPx` fails → use `minFontPx`, set warning `text-overflow`.
5. Line height default: 1.2 latin, 1.6 khmer (tunable constants in `rules.config.ts`).
6. Position: the box above. Text alignment from style.
7. Override rule: if `override.style.fontSizePx` exists, use it as-is (no fit). If only `override.frame` exists, fit still runs inside that frame.

## Output-only layers (T12.4, D32)
An output's own `layer` ports (`output.layers`, front first) are drawn **above** the composition's layers, back→front, while a `layer` edge feeds them. They are not on the master's grid and don't move the composition's layers. A source the composition already draws is skipped here (the composition wins). Overrides, `hidden` and frozen frames apply as for any layer. Default frames, in the output's canvas:
- **background** — as above (cover / full rect).
- **logo** — top-right corner of `S`; width `max(0.15·min(S.w,S.h), minLogoWidthPct%·min(Wt,Ht))`, height by the asset's aspect (square if unknown).
- **text** — a full-width band over the bottom quarter of `S`: `{S.x, S.y + 0.75·S.h, S.w, 0.25·S.h}`; fit-to-box starting at `fontSizePx·k`.
- **subject / decoration** — contain-fit of the asset's aspect (square if unknown) into `0.6·S.w × 0.6·S.h`, centred in `S`.

## Worked examples (must be unit tests)
Mock measure for tests: `width = text.length · 0.5 · fontPx`.

**A. Subject.** Master 3000×3000; subject frame `{x:900,y:750,w:1200,h:1800}` (centre (0.5, 0.55): centre pins). Other layers don't change it.
- 1080×1350 px, no bleed: `sx=0.36, sy=0.45, g=√0.162≈0.402492` → 482.99×724.49 centred at (540, 742.5) → `{x:298.504658, y:380.256988, w:482.990683, h:724.486025}`.
- Story 1080×1920: `g = √(0.36·0.64) = 0.48` → 576×864 centred at (540, 0.55·1920 = 1056) → `{x:252, y:624, w:576, h:864}`.
- Banner 3000×1000: `g = √(1/3) ≈ 0.577` would be 1039 tall; centred at y 550 the room is `2·450/1800 = 0.5` → 600×900 → `{x:1200, y:100, w:600, h:900}`.
- With 1 in (96 px) bleed on 1080×1350: the 1080×1350 frame moved by (96, 96).

**J. Near an edge.** Subject `{x:2400,y:1200,w:500,h:600}`: centre x at 0.883 → end pin, its right edge at `u = 2900/3000`; centre y 0.5 → centre. Story 1080×1920 (`g = 0.48`): 240×288, right edge at `u·1080 = 1044`, centre y 960 → `{x:804, y:816, w:240, h:288}`.

**L. Room.** Story 1080×1920, subject `{x:240,y:1000,w:2520,h:300}` (centre pins): `g = 0.48` would be 1209.6 wide; centred at x 540 the room is `1080/2520 ≈ 0.428571` → `{x:0, w:1080, h:128.571429}`, centre y at `(1150/3000)·1920 = 736`.

**K. Filling layers.** A subject `{0,0,3000,3000}` fills both axes: 1080×1350 → `c = 0.45` → `{x:−135, y:0, w:1350, h:1350}`; 3000×1000 → `c = 1` → `{x:0, y:−1000, w:3000, h:3000}`. A strip `{x:0,y:2400,w:3000,h:600}` fills x only (`c = sx`), its bottom edge pinned: story 1080×1920 → `{x:0, y:1704, w:1080, h:216}`; 3000×1000 → `{x:0, y:400, w:3000, h:600}`.

**C. Background cover with focal.** Image 4000×3000, focal (0.7, 0.4). Output 1080×1350, no bleed.
`s = max(0.27, 0.45) = 0.45` → 1800×1350; `left = clamp(540 − 0.7·1800, −720, 0) = −720`; `top = clamp(675 − 0.4·1350, 0, 0) = 0` → frame `{x:−720, y:0, w:1800, h:1350}`.

**D. Logo.** Master logo frame `{x:150,y:150,w:400,h:200}` (top-left: start pins). Output 1080×1350: `c = g ≈ 0.402492` → 160.997×80.498 at `(150·0.36, 150·0.45)` → `{x:54, y:67.5}`; min width `8%·1080 = 86.4` ok. Output 3000×1000: `c = √(1/3)` → 230.94×115.47 at `{x:150, y:50}`. Top-right `{x:2450,…}` → right edge at `2850·0.36 = 1026` → `x = 1026 − 160.997`. A 100×50 logo at (150,150) on 1080×1350: 40.25 < 86.4 → `{x:54, y:67.5, w:86.4, h:43.2}`, warning `min-logo`.

**E. Text fit.** Master 3000², headline frame `{x:300,y:300,w:2400,h:500}` (centre x 0.5 → centre; centre y 0.18 → top edge), font 200, text `"AAAAA BBBBB CCCCC DDDDD EEEEE"` (29 chars). Output 1080×1350.
Box: `c = g ≈ 0.402492` → 965.98×201.25 at `x = 540 − 482.99`, `y = 300·0.45 = 135`; `f0 ≈ 80.5`.
- maxLines 2 → **80 px**, 2 lines (4 words + 1), height 192 ≤ 201.25.
- maxLines 1 → largest 0.5-step with `29·0.5·f ≤ 965.98` → **66.5 px**, 1 line.

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

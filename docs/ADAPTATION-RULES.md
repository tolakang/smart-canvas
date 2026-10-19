# ADAPTATION-RULES (layout engine v1)

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
- `k = min(Wt/Wm, Ht/Hm)` — uniform contain-scale of master onto trim.
- Source master frame `F` (from `NFrame`×master). Anchor `(ax, ay)` = centre of `F` normalized 0..1.
- Ratio `r = Wt/Ht`. Family: `output.family` if not 'auto'; else `side` when `r ≥ 1.3`, otherwise `stack`.
- Layer order = ports (0 front). Rendering order = back→front.

## Rules by behaviour
**background (image)** — cover on the full canvas (incl. bleed).
`s = max(W/iw, H/ih)`; size `iw·s × ih·s`; `left = clamp(W/2 − fx·iw·s, W − iw·s, 0)`; `top = clamp(H/2 − fy·ih·s, H − ih·s, 0)` where `(fx,fy)` = focal point.
**background (fill)** — rect `0,0,W,H`.

**subject** — size `F.w·k × F.h·k`.
- stack: centre `(b + ax·Wt, b + ay·Ht)`.
- side: centre x `= S.x + (0.5 + 0.5·ax)·S.w` (subject goes to the right half), centre y `= b + ay·Ht`.
- Then fit into `S`: if larger, scale down by `min(S.w/w, S.h/h)`; translate to stay inside `S` (add warning `clamped` if moved/scaled).

**decoration** — same as subject but no clamp (may bleed off edges).

**logo** — size `F.w·k × F.h·k`; enforce min width `minLogoWidthPct% · min(Wt,Ht)` keeping aspect (warning `min-logo` if enforced). Corner = nearest to master centre of `F` (`ax<0.5` left else right; `ay<0.5` top else bottom). Placed flush to that corner of `S`.

**text** — fit-to-box.
1. Start size `f0 = style.fontSizePx · k`.
2. Box: width `bw = min(F.w/Wm · Wt, S.w)` (side family: column width `0.5·S.w`); height `bh = F.h/Hm · Ht` (side family: see stack below).
3. Break lines with greedy word wrap. Khmer (language km, or auto-detected when text contains U+1780–17FF): break only at `Intl.Segmenter('km',{granularity:'word'})` boundaries; never inside a word unless a single word is wider than `bw` (then fall back to grapheme breaks). Latin: break at spaces.
4. Result font = largest size on a 0.5 px grid, `≤ f0` and `≥ minFontPx`, such that `lines ≤ maxLines` and `lines·size·lineHeight ≤ bh`. If even `minFontPx` fails → use `minFontPx`, set warning `text-overflow`.
5. Line height default: 1.2 latin, 1.6 khmer (tunable constants in `rules.config.ts`).
6. Position: stack → box centre `(b + ax·Wt, b + ay·Ht)`; then clamp into `S`. Text alignment from style.
7. **side family**: all text sources form one column in the left half of `S` (`x = S.x`, `w = 0.5·S.w`), stacked in master top→bottom order with gap `2%·Ht`; block is vertically centred in `S`. If the block is taller than `S.h`, scale all font sizes by `S.h/blockHeight` (not below `minFontPx`).
8. Override rule: if `override.style.fontSizePx` exists, use it as-is (no fit). If only `override.frame` exists, fit still runs inside that frame.

## Worked examples (must be unit tests)
Mock measure for tests: `width = text.length · 0.5 · fontPx`.

**A. Subject, stack.** Master 3000×3000; subject frame `{x:900,y:750,w:1200,h:1800}`. Output 1080×1350 px, no bleed.
`k=0.36` → size 432×648; centre (540, 742.5) → frame `{x:324, y:418.5, w:432, h:648}`.

**B. Subject, side (wide).** Same master/subject. Output 3000×1000 px, family auto (r=3 → side).
`k=1/3` → 400×600; safe margin 50 → `S={x:50,y:50,w:2900,h:900}`; centre x = 50 + 0.75·2900 = 2225; centre y = 550 → frame `{x:2025, y:250, w:400, h:600}`.

**C. Background cover with focal.** Image 4000×3000, focal (0.7, 0.4). Output 1080×1350, no bleed.
`s = max(0.27, 0.45) = 0.45` → 1800×1350; `left = clamp(540 − 0.7·1800, −720, 0) = −720`; `top = clamp(675 − 0.4·1350, 0, 0) = 0` → frame `{x:−720, y:0, w:1800, h:1350}`.

**D. Logo.** Master logo frame `{x:150,y:150,w:400,h:200}` (top-left). Output 1080×1350: `k=0.36` → 144×72; min width `8%·1080 = 86.4` ok; placed at S corner `S.x=S.y=54` → `{x:54,y:54,w:144,h:72}`. Output 3000×1000: `k=1/3` → 133.33×66.67 at `{x:50,y:50}`.

**E. Text fit.** Master 3000², headline frame `{x:300,y:300,w:2400,h:500}`, font 200, text `"AAAAA BBBBB CCCCC DDDDD EEEEE"` (29 chars). Output 1080×1350, stack.
`f0=72`, `bw=min(864, 972)=864`, `bh=225`.
- maxLines 2 → 72 px, 2 lines (4 words + 1), height 172.8 ≤ 225.
- maxLines 1 → largest 0.5-step with `29·0.5·f ≤ 864` → **59.5 px**, 1 line.

**F. Export size.** A4 210×297 mm, 300 dpi: trim 2480×3508 px; with 3 mm bleed (216×303 mm) 2551×3579 px. 1080×1350 px at scale 2 → 2160×2700.

## Sync rules (summary of D20/D21)
- Master/input edit → every connected output recomputes; overrides stay.
- Disconnect → store `output.frozen` = current computed frames (+ font sizes). While `frozen` exists, `computeLayout` returns those frames (overrides still applied on top) and ignores master/layout changes; content (text, images) still updates. Reconnect deletes `frozen`.
- Reconnect → no overrides: recompute silently. Overrides exist: dialog [Keep overrides · Reset all · Cancel].
- "Reset layer" removes that override; "Reset output" clears all overrides of the output.

# S3 — SVG text outlines

**Result: pass.** HarfBuzz (`harfbuzzjs`) shapes Khmer and produces outlines that match the browser's own render to **within 1 px** in every case tested. The advance widths are the same to within 0.1 px (typically 0.01 px). This proves O5 and unblocks T6.4's outline option.

- **Code:** `apps/worker/src/outline.ts`
- **Test:** `apps/worker/src/outline.e2e.test.ts` (Chromium; runs in CI)

## What was compared

For each case, the same line is drawn twice in Chromium 141:
1. **Live text:** the bundled web font, loaded through the font package's own `@font-face` rules (one face per subset, each with its `unicode-range`), the same way the app loads it.
2. **Outlines:** `outlineLine()` paths in an `<svg>`, placed on the live text's baseline (rounded to a whole pixel, as Chromium draws it).

The cases:
- **2 families × 2 weights:** Noto Sans Khmer and Kantumruy Pro, each at 400 and 700.
- **4 lines:** a long line with subscripts (សូមស្វាគមន៍…); a triple stack (ស្ត្រី…); stacked consonants (ក្រុមហ៊ុនផ្គត់ផ្គង់…); and a mix of Khmer, Khmer digits, % and Latin ("ព្រឹត្តិការណ៍ ៥០% Grand opening").
- **3 sizes:** 24, 64 and 140 px.

That makes 48 cases.

Pass means:
- the outline advance equals the browser's measured width of the run (< 0.1 px);
- every solid pixel (alpha > 160) of either render has an inked pixel (alpha > 64) of the other within 1 px, checked both ways.

Two thresholds are needed because anti-aliasing puts the same thin stroke at alpha 125 in one render and 128 in the other. A single cut-off would count that as a miss. As a check, shifting the outlines by 2 px fails with about 150 pixels off.

## How it works

1. **WOFF → sfnt.** HarfBuzz reads only TTF/OTF data. The bundled fonts ship as WOFF2 (used by the browser) and WOFF 1.0. `woffToSfnt` turns WOFF 1.0 back into TTF data with `zlib`, in about 40 lines, so no WOFF2 decoder dependency is needed.
2. **Font runs.** `fontRuns` splits the line into runs, choosing a face for each grapheme by the face's `unicode-range` and its glyph table, like the browser does.
   - This is required: the Khmer subset file also contains Latin glyphs. Shaping "Grand opening" with it gives a 0.47 px wider line than the browser draws, because the browser uses the Latin face.
   - Faces are tried last-declared first, as CSS does.
3. **Shape and draw.** HarfBuzz shapes each run (`guessSegmentProperties`: script, direction, language). This covers Khmer reordering, coeng subscripts and mark positioning. Each glyph becomes `glyphToPath` scaled to the font size, placed at its pen position plus HarfBuzz's x/y offsets.
4. **Letter spacing** is added after each cluster, as in CSS. Marks and subscripts share their base's cluster.

## Finding: font hinting must be off in the worker

On a host whose font settings turn hinting on (the GitHub Actions runner does), headless Chromium rounds each glyph advance to whole pixels. At 24 px the Khmer test line came out **3.7 px narrower** with Noto Sans Khmer (5.7 px at weight 700), so the outlines and the browser disagreed.

The same rounding would also make the worker's text widths, and therefore its line breaks, depend on the host instead of the font. So the worker now launches Chromium with `--font-render-hinting=none` (`CHROMIUM_ARGS` in `render.ts`, used by the worker and the tests). Advances then keep their design widths everywhere, as on an unhinted screen.

Reproduced locally with `--font-render-hinting=full`: the exact CI numbers, 3.680 and 5.704 px.

## fontkit is not needed

O5 named "harfbuzzjs + fontkit". HarfBuzz alone gives both the shaping and the outlines (`glyphToPath`), so fontkit adds nothing here. fontkit stays where it already is (font upload validation in the API, and Khmer metrics in tests).

## New dependency

`harfbuzzjs@1.6.3` (worker only), pinned to an exact version. It is the official HarfBuzz WebAssembly build (MIT), with no native code and about 440 KB of wasm. It is the shaping engine Chromium itself uses, which is why the outlines line up with the screen.

## What T6.4 still has to do (not part of this spike)

- Use the export page's lines, frame, alignment and font size from the layout engine. The engine already decides line breaks, so the outliner only draws given lines (left, center or right aligned by `advance`).
- Load each face's WOFF and its `unicode-range` from the same CSS the web app bundles, plus team-uploaded fonts.
  - TTF/OTF uploads work as they are.
  - **WOFF2 uploads** (the API accepts them) need decoding to TTF first, either once at upload or with a WOFF2 decoder. That is the one place fontkit, or a small brotli-based decoder, may still be needed. Decide in T6.4.
- Handle uppercase (`textTransform`) the same way: transform before outlining, as the renderer does.
- Handle a line whose font is missing: fall back to live text and warn, rather than outlining `.notdef` boxes.

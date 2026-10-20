# S2 — Khmer text parity

**Result: pass.** On the board and in the export worker, the same Khmer text breaks into the same lines at the same size. Every break falls on an `Intl.Segmenter('km')` word boundary. No glyph is clipped.

Test: `apps/worker/src/khmer-parity.e2e.test.ts`. It runs in CI with the other Postgres/Chromium tests.

## Setup

- **Full stack:** the API on Postgres, the web app on Vite and Chromium 141 (Playwright 1.56.1).
- **Fonts:** the bundled `@fontsource` Noto Sans Khmer and Kantumruy Pro 5.3.0, the same files on the board and in the worker.
- **"Screen":** the real board in a browser context at `deviceScaleFactor: 2`, reading the output nodes' thumbnails.
- **"Worker":** the export render page opened by `openRender`, exactly as the worker does, at scale 1.
- **5 headlines × 6 outputs** (1080×1350, 1080×1080, 1080×1920, 1200×630, 1500×500, A5 at 300 dpi):

| # | Headline | Font |
|---|---|---|
| 1 | សូមស្វាគមន៍មកកាន់ប្រទេសកម្ពុជា | Noto Sans Khmer 700 |
| 2 | ការលក់ពិសេសថ្ងៃនេះ បញ្ចុះតម្លៃ ៥០% | Noto Sans Khmer 400 |
| 3 | ព្រឹត្តិការណ៍ពិសេស Grand opening | Kantumruy Pro 700 |
| 4 | ស្ត្រីខ្មែរស្រស់ស្អាតជារៀងរហូត (triple stack ្ត្រ) | Kantumruy Pro 400 |
| 5 | ក្រុមហ៊ុនផ្គត់ផ្គង់គ្រឿងសង្ហារិមល្អបំផុតក្នុងរាជធានីភ្នំពេញ | Noto Sans Khmer 700 |

## What was checked, per headline and output

1. **Same lines and font size:** the board and the worker produce the same `lines` and `fontSize`. Pass in 30 of 30 cases.
2. **Word breaks:** every line ends on a word boundary from the page's own `Intl.Segmenter('km')`, and the joined lines equal the text. Pass in 30 of 30.
3. **Not clipped:** on a transparent canvas, the drawn pixels (ink) stay inside the canvas with at least 1 px to spare. Pass in 30 of 30.

## Finding: Noto Sans Khmer ink below the line box

- **What happens:** with Noto Sans Khmer, deep subscripts (្វ ្ព ្គ…) draw up to about **0.16 em below the last line box**. With line height 1.6 the glyphs sit low in the line: about 0.25 em of room above, and −0.16 em below on the last line. This is seen when the text box is exactly one line tall (the 1200×630 and 1500×500 outputs). Kantumruy Pro stays inside its line box.
- **Clipping today:** none. A text box never touches the canvas edge in the default layout; the nearest is 230 px away.
- **Risk:** an override that puts a Noto Sans Khmer headline flush against the bottom edge would cut the subscripts by up to 0.16 em. The test fails if the overhang grows past 0.2 em.
- **Possible follow-up (not done here, so no locked rule changes):** keep a bottom inset of 0.2 em for Khmer text boxes at the canvas edge, or let the safe area cover it.

## Not covered

- **The user's own browser:** this test compares Chromium with Chromium on Linux, the same engine as the worker. A real user's browser (Chrome on macOS or Windows, Safari, Firefox) may measure slightly differently. That doesn't change exports, because the worker lays the text out again itself. The board preview might break a line differently in rare cases, so the export stays the reference.
- **Team-uploaded Khmer fonts:** not covered. They go through the same path (`@font-face` + canvas measure), so the result should hold.

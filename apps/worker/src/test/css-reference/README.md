# CSS reference (Tailwind conversion safety net, P28)

`styles.css` here is the app's built stylesheet as it was on `main` before the current PR, written by
`node scripts/css-reference.mjs` (it names the commit in its first line). The parity test
(`css-parity-*.e2e.test.ts`, helpers in `../parity-suite.ts`) sets up each screen and state in the real app, then
draws it twice on the same page: once with the app's own stylesheets (Tailwind's included) and once with this copy in
their place. The computed styles of the converted area must match exactly, and every pixel of the page too, so a
conversion step can't change how anything looks.

This works because the markup keeps its `sc-` classes during the conversion (TAILWIND-PLAN.md, rule 5): the old CSS
still finds every element.

`areas.json`, written by the same script, lists the rules this branch removes from main's stylesheets. While the
reference is drawn, the elements those rules style lose their new utility classes, as they were at main; otherwise
main's own utilities (`.border`, `.grid`…) would style them in the reference draw.

At the start of each conversion PR, and again once its rules are removed: `node scripts/css-reference.mjs`, then
commit both files. If a change is meant to look different, it doesn't belong in a conversion PR. Delete this folder
when the conversion is done (T8).

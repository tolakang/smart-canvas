# CSS reference (Tailwind conversion safety net, P28)

`styles.css` here is the app's built stylesheet as it was on `main` before the current PR, written by
`node scripts/css-reference.mjs` (it names the commit in its first line). `css-parity.e2e.test.ts` sets up each
screen and state in the real app, then draws it twice on the same page: once with the app's own stylesheets
(Tailwind's included) and once with this copy in their place. Every element's computed style must match exactly,
and the pixels too, so a conversion step can't change how anything looks.

This works because the markup keeps its `sc-` classes during the conversion (TAILWIND-PLAN.md, rule 5): the old CSS
still finds every element.

At the start of each conversion PR: `node scripts/css-reference.mjs`, then commit the file. If a change is meant to
look different, it doesn't belong in a conversion PR. Delete this folder when the conversion is done (T8).

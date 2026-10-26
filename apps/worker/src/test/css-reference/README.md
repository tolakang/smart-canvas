# CSS reference (cleanup safety net)

`styles.css` here is a frozen copy of `apps/web/src/styles.css` from before the CSS cleanup. The
`css-parity.e2e.test.ts` test sets up each screen and state in the real app, then draws it twice: once with the
app's own stylesheets and once with this copy in their place. Both are compared on the same machine, pixel by
pixel and by every element's computed style, so the cleanup must not change a thing.

The cleanup only reorganizes CSS. If a change is meant to look different, make the same change here in the same
PR. Delete this folder once the cleanup is finished.

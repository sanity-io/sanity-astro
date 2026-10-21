---
'@sanity/astro': minor
---

`<VisualEditing />` now boots `@sanity/visual-editing` from a plain `<script>`, so sites that only use `.astro` components no longer need `@astrojs/react` for Presentation. Add `experimental_inPlaceRefresh` to patch stega text as editors type and morph the page in place instead of reloading it. Without the flag the page still reloads on every refresh.

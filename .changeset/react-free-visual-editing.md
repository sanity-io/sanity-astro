---
'@sanity/astro': minor
---

`<VisualEditing />` now boots `@sanity/visual-editing` from a plain `<script>`, so sites that only use `.astro` components no longer need `@astrojs/react` for Presentation. Set `experimental_refreshStrategy="in-place"` to patch stega text as editors type and morph the page in place instead of reloading it. With the default `'reload'` strategy the page still reloads on every refresh.

---
'@sanity/astro': minor
---

`VisualEditingComponent` now forwards every `VisualEditingOptions` prop to `<VisualEditing />` from `@sanity/visual-editing/react`, including `onPerspectiveChange` and the alpha `components` / `plugins` resolvers. `refresh` and `history` keep their existing defaults when omitted.

Thanks to [@skezo](https://github.com/skezo) — re-land of [#420](https://github.com/sanity-io/sanity-astro/pull/420).

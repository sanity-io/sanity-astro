---
'@sanity/astro': minor
---

`VisualEditingComponent` from `@sanity/astro/visual-editing/component` now accepts and forwards every `VisualEditingOptions` prop of `@sanity/visual-editing`, adding `onPerspectiveChange`, `onVariantChange` and the alpha `components` and `plugins` options. The default `history` and `refresh` behavior is unchanged and `portal` stays forced on. The callback parameter types (`HistoryAdapter`, `HistoryAdapterNavigate`, `HistoryRefresh`, `HistoryUpdate`, `OverlayComponentResolver`, `OverlayPluginDefinition`, `SuspiciousStegaReport` and `VisualEditingOptions`) are re-exported from the same subpath, and test files are no longer included in the published package. Thanks [@skezo](https://github.com/skezo) ([#420](https://github.com/sanity-io/sanity-astro/pull/420)).

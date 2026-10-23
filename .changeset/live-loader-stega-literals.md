---
'@sanity/astro': patch
---

Generated live-loader Zod schemas accept stega-encoded string literals, such as portable text `style` and `listItem`, and parse them back to the plain literal. Draft Mode no longer fails `getLiveCollection` and `getLiveEntry` on those fields. Prose strings stay encoded.

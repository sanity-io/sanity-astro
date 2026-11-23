---
'@sanity/astro': patch
---

Allow top-level await when `astro dev` pre-bundles the embedded Studio's dependencies on Vite 6 and older (Astro 5 and older). `@sanity/vision` depends on `@sanity-labs/groq-wasm`, which awaits its WASM at the top level, and esbuild's default `es2020` dev target rejected it, so pre-bundling a `sanity.config` with `visionTool()` failed and left the page's islands unhydrated.

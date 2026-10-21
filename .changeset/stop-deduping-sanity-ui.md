---
'@sanity/astro': patch
---

Stop deduping `@sanity/ui` in `astro dev`, so apps that render both the Studio and visual editing no longer load two incompatible `@sanity/ui` versions in the same page

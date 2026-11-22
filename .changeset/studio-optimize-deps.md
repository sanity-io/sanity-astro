---
'@sanity/astro': patch
---

Pre-bundle the embedded Studio's dependencies when `astro dev` starts, so the first visit to the Studio no longer triggers a dependency re-optimization and page reload that can leave chunks failing with `504 Outdated Optimize Dep`

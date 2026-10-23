---
'@sanity/astro': patch
---

Fix `astro dev` crashing when a warm-start `schema.json` is missing a newly configured live loader document type; re-extract immediately instead of aborting before the background refresh

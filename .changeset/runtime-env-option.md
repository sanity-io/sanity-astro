---
'@sanity/astro': minor
---

Add an opt-in `env` option that reads `projectId` and `dataset` from environment variables when the server runs, so one build can serve several projects or datasets. It applies to `sanityClient` in server code and to the embedded Studio with `browser` history, and requires Astro 5 or later. Sites that don't set `env` are unaffected.

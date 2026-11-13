---
'@sanity/astro': minor
---

Add an `env` option that reads `projectId` and `dataset` from environment variables when the server runs, through `astro:env`. One server build can now serve different datasets, for example the same Docker image in several environments. It applies to `sanityClient` in server code and to the embedded Studio with `browser` history; the build-time `projectId` and `dataset` stay in use everywhere else.

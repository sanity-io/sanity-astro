---
'@sanity/astro': minor
---

Add an experimental `sanityLoader` for Astro content collections, exported from the new `@sanity/astro/loader` entrypoint. It feeds a GROQ query into the Content Layer, so `getCollection()` and `getEntry()` work for Sanity documents, skips unchanged entries using a content digest, prunes entries that left the query result, and throws when two documents map to the same entry id

---
'@sanity/astro': minor
---

Add an opt-in `clients` option for reading from several Sanity projects or datasets in one Astro site. `sanity:client` keeps exporting `sanityClient` and adds `getClient(name)` and `presentationClient`. When `clients` is set, typed client names are generated for Astro 4.14 and later. Sites that don't set `clients` are unaffected.

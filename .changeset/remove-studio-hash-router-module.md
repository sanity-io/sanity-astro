---
'@sanity/astro': patch
---

Remove the undocumented `sanity:studio-hash-router` virtual module. The shipped Studio routes never imported it, so documented features are unaffected. Import your Studio config from `sanity:studio` instead if you relied on it.

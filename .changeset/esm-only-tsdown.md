---
'@sanity/astro': major
---

Publish an ESM-only build. The UMD bundle and the `module` export condition are removed, subpath exports point at `dist/`, and `src/` is no longer included in the package.

---
'@sanity/astro': minor
---

Add an opt-in `experimental_live` option. When set, the integration generates typed live loaders and Zod schemas from your Sanity schema. With the option unset, nothing is extracted or generated. `@sanity/astro/loader` also exports the experimental `createSanityLiveLoader`.

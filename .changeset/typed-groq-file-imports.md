---
'@sanity/astro': minor
---

Your `.groq` files can now type your queries for you. With `@sanity/client` 7.28.0 or 8.11.0 and later, `sanityClient.fetch` from `sanity:client` reads the result and params types off a query imported through the experimental [`@sanity-labs/groq-content-mapper`](https://github.com/sanity-labs/groq-content-mapper), so you can stop writing the result type by hand.

Before, you spelled out the type yourself:

```ts
import {sanityClient} from 'sanity:client'

const post = await sanityClient.fetch<{title: string | null} | null>(
  `*[_type == "post" && slug.current == $slug][0]{title}`,
  {slug},
)
```

After, the query lives in `post.groq` and brings its types along:

```ts
import {sanityClient} from 'sanity:client'

import query from './post.groq' with {type: 'text'}

const post = await sanityClient.fetch(query, {slug})
//    ^? {title: string | null} | null, and a typo in `slug` is a type error
```

The experimental `sanityLoader` gets the same treatment: hand it a `.groq` import as `query`, and `params` are checked and the `id` callback's document is typed, no generic needed.

The mapper and the client's support for it are experimental, and the mapper needs TypeScript 7.1. The new "Typing query results" section of the README shows the Astro setup, plus how to type your own `sanityFetch` helpers with `ClientReturn` and `ClientParams` so they keep the inferred types. Plain strings, explicit generics and Sanity TypeGen queries work exactly as before.

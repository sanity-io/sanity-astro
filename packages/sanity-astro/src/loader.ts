import type {QueryParams, SanityClient} from '@sanity/client'
import type {Loader} from 'astro/loaders'

/**
 * @experimental The loader API may change in a minor release.
 */
export type SanityDocumentLike = Record<string, unknown> & {_id: string}

/**
 * @experimental The loader API may change in a minor release.
 */
export type SanityLoaderOptions<TDocument extends SanityDocumentLike = SanityDocumentLike> = {
  /**
   * The client to fetch with. Pass `sanityClient` from `sanity:client` to reuse the
   * integration's configuration.
   */
  client: SanityClient
  /** A GROQ query that returns an array of documents. Every document needs a string `_id`. */
  query: string
  params?: QueryParams
  /**
   * Picks the entry id used by `getEntry()` and `getStaticPaths()`. Defaults to `_id`.
   * Return `slug.current` here when pages are addressed by slug.
   */
  id?: (document: TDocument) => string
}

function assertDocuments<TDocument extends SanityDocumentLike>(
  result: unknown,
): asserts result is TDocument[] {
  if (!Array.isArray(result)) {
    throw new Error(
      `[@sanity/astro]: sanityLoader expects the query to return an array of documents, got ${typeof result}`,
    )
  }
  for (const document of result) {
    if (typeof document?._id !== 'string') {
      throw new Error(
        '[@sanity/astro]: sanityLoader needs a string `_id` on every document. Keep `_id` in the query projection.',
      )
    }
  }
}

/**
 * Feeds a GROQ query into Astro's Content Layer for `defineCollection()`.
 *
 * @experimental The loader API may change in a minor release.
 */
export function sanityLoader<TDocument extends SanityDocumentLike = SanityDocumentLike>({
  client,
  query,
  params = {},
  id = (document) => document._id,
}: SanityLoaderOptions<TDocument>): Loader {
  return {
    name: '@sanity/astro',
    async load({store, logger, parseData, generateDigest}) {
      const documents = await client.fetch<unknown>(query, params)
      assertDocuments<TDocument>(documents)

      const seen = new Set<string>()
      for (const document of documents) {
        const entryId = id(document)
        seen.add(entryId)
        const data = await parseData({id: entryId, data: document})
        store.set({id: entryId, data, digest: generateDigest(document)})
      }
      for (const key of store.keys()) {
        if (!seen.has(key)) store.delete(key)
      }

      logger.info(`Loaded ${documents.length} documents`)
    },
  }
}

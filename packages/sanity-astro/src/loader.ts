import type {QueryParams, SanityClient} from '@sanity/client'
import type {Loader} from 'astro/loaders'

export type SanityDocumentLike = Record<string, unknown> & {_id: string}

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
      if (!Array.isArray(documents)) {
        throw new Error(
          `[@sanity/astro]: sanityLoader expects the query to return an array of documents, got ${typeof documents}`,
        )
      }

      store.clear()
      for (const document of documents as TDocument[]) {
        if (typeof document?._id !== 'string') {
          throw new Error(
            '[@sanity/astro]: sanityLoader needs a string `_id` on every document. Keep `_id` in the query projection.',
          )
        }
        const entryId = id(document)
        const data = await parseData({id: entryId, data: document})
        store.set({id: entryId, data, digest: generateDigest(document)})
      }

      logger.info(`Loaded ${documents.length} documents`)
    },
  }
}

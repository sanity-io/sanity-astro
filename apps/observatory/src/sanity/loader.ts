import type {ClientReturn} from '@sanity/client'
import type {LiveLoader} from 'astro/loaders'

import {CACHE_TTL_SECONDS, SANITY_CACHE_TAG, type SanityFetchContext, sanityFetch} from './fetch'

/**
 * Every entry is loaded in the context of the current request: which audience
 * variant to resolve and whether Presentation preview is active.
 */
export type SanityEntryFilter = SanityFetchContext

class SanityLoaderError extends Error {
  override name = 'SanityLoaderError'
}

/**
 * Live loader for a Sanity singleton document. Every entry carries a full
 * cache hint: the query's sync tags plus the response TTL. Pages feed the
 * tags to the live-update island on every render, but forward the hint into
 * `Astro.cache.set(entry)` only outside preview, because `cache.set` headers
 * are applied after middleware runs, and a forwarded preview hint would get
 * the per-editor draft response cached on the shared CDN.
 */
export function defineSanityDocument<const Q extends string>(id: string, query: Q) {
  type Data = NonNullable<ClientReturn<Q>> & Record<string, unknown>

  async function load(filter: SanityEntryFilter) {
    const {data, tags} = await sanityFetch(query, filter)
    if (data === null) return undefined
    return {
      id,
      data: data as Data,
      cacheHint: {tags: [...tags, SANITY_CACHE_TAG], maxAge: CACHE_TTL_SECONDS},
    }
  }

  const loader: LiveLoader<Data, SanityEntryFilter, SanityEntryFilter, SanityLoaderError> = {
    name: `sanity-${id}`,
    async loadEntry({filter}) {
      try {
        return await load(filter)
      } catch (cause) {
        return {error: new SanityLoaderError(`Failed to load "${id}" from Sanity`, {cause})}
      }
    },
    async loadCollection({filter}) {
      try {
        const entry = filter === undefined ? undefined : await load(filter)
        return {entries: entry === undefined ? [] : [entry]}
      } catch (cause) {
        return {error: new SanityLoaderError(`Failed to load "${id}" from Sanity`, {cause})}
      }
    },
  }

  return loader
}

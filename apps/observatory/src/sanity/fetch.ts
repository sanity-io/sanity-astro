import {type ClientReturn} from '@sanity/client'

import type {Audience} from '../lib/audience'
import type {PreviewState} from '../lib/preview'
import {client, toPerspective} from './client'

export interface SanityFetchContext {
  audience: Audience | undefined
  preview: PreviewState
}

export interface SanityFetchResult<T> {
  data: T
  /** Content Lake sync tags: opaque ids describing what this result depends on. */
  tags: string[]
}

/** Catch-all surrogate key so the whole Sanity page cache can be purged at once. */
export const SANITY_CACHE_TAG = 'sanity'

/**
 * Pages are cached on the CDN with their sync tags as surrogate keys and
 * purged the moment content changes, so the TTL is only a backstop and can be
 * as long as the platform allows.
 */
export const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365

/**
 * Single fetch path for all Sanity content. There is no data cache in front
 * of this: published reads come from Sanity's API CDN, and response caching
 * happens at the CDN layer via the loaders' cache hints.
 *
 * Published requests resolve the personalized variant on Content Lake via the
 * `audience` condition; preview requests follow the perspective and variant
 * selected in Presentation and get stega encoding for Visual Editing
 * overlays.
 */
export async function sanityFetch<const Q extends string>(
  query: Q,
  {audience, preview}: SanityFetchContext,
): Promise<SanityFetchResult<ClientReturn<Q>>> {
  const {result, syncTags = []} = await client.fetch(
    query,
    {},
    preview.enabled
      ? {
          filterResponse: false,
          useCdn: false,
          perspective: toPerspective(preview.perspective),
          ...(preview.variant === undefined ? {} : {variant: preview.variant}),
          stega: true,
        }
      : {
          filterResponse: false,
          // Renders land in a long-TTL response cache that is only purged by
          // sync tag, so a stale-while-revalidate read here could get pinned
          // until the next publish. `noStale` makes Sanity's CDN revalidate
          // synchronously right after content changes instead of serving the
          // stale copy once.
          cacheMode: 'noStale',
          ...(audience === undefined ? {} : {variant: {audience}}),
        },
  )

  return {data: result, tags: syncTags}
}

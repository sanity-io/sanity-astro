import {type ClientParams, type ClientReturn} from '@sanity/client'

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

/**
 * Pages are cached on the CDN with their sync tags as surrogate keys, and a
 * tag purge refreshes them the moment content changes. The TTL is the
 * backstop for a purge that never arrives (no live listener open, the
 * invalidate function not deployed, a failed call): pages go stale after five
 * minutes and are revalidated in the background for up to a day.
 */
export const PAGE_CACHE = {maxAge: 60 * 5, swr: 60 * 60 * 24} as const

/** Union of the sync tags of several results, for one page's cache entry. */
export function mergeTags(...results: SanityFetchResult<unknown>[]): string[] {
  return [...new Set(results.flatMap((result) => result.tags))]
}

/**
 * Single fetch path for all Sanity content. There is no data cache in front
 * of this: published reads come from Sanity's API CDN, and response caching
 * happens at the CDN layer through `Astro.cache.set` in each page.
 *
 * Published requests resolve the personalized variant on Content Lake via the
 * `audience` condition; preview requests follow the perspective and variant
 * selected in Presentation and get stega encoding for Visual Editing
 * overlays.
 */
export async function sanityFetch<const Q extends string>(
  query: Q,
  {audience, preview}: SanityFetchContext,
  params?: ClientParams<Q>,
): Promise<SanityFetchResult<ClientReturn<Q>>> {
  const {result, syncTags = []} = await client.fetch(
    query,
    params ?? {},
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
          // A tag purge re-renders the page right after a publish. If this read
          // got Sanity's stale-while-revalidate copy, the old content would be
          // cached again until the TTL backstop. `noStale` makes Sanity's CDN
          // revalidate synchronously instead.
          cacheMode: 'noStale',
          ...(audience === undefined ? {} : {variant: {audience}}),
        },
  )

  return {data: result, tags: syncTags}
}

import {dangerouslyDeleteByTag} from '@vercel/functions'
import type {APIRoute} from 'astro'

/** Sync tags are short opaque ids with a base64-flavored charset, e.g. `s1:WHrX/A`. */
const TAG_PATTERN = /^[a-zA-Z0-9+/=._:-]{1,128}$/
const MAX_TAGS = 64

/**
 * Deletes every CDN-cached page whose surrogate keys (`Vercel-Cache-Tag`,
 * set from the loaders' cache hints) include the given Content Lake sync
 * tags — https://vercel.com/docs/caching/cdn-cache/purge#programmatically-purging-cdn-cache
 *
 * This uses the hard-delete variant rather than `invalidateByTag` on
 * purpose: invalidation serves the stale page once more while revalidating
 * in the background, and since the update toast explicitly asks the visitor
 * to refresh for new content, that would mean refreshing twice. Deletion
 * makes the next request render fresh, at the cost of one uncached response.
 *
 * Deliberately unprotected to keep the reference easy to run locally and on
 * any deployment: `<sanity-live>` calls it straight from the browser, and
 * the worst a bogus call can do is cause a cache miss. A real production
 * implementation would not let browsers purge caches: it would gate the
 * endpoint on a secret environment variable and invoke it server-to-server
 * from a Sync Tag Invalidate Function on publish, which also covers content
 * changes that happen while nobody has a page open:
 * https://www.sanity.io/docs/functions/sync-tag-function-quickstart
 */
export const POST: APIRoute = async ({request}) => {
  const body: unknown = await request.json().catch(() => null)
  const requested =
    typeof body === 'object' && body !== null && 'tags' in body && Array.isArray(body.tags)
      ? body.tags
      : []

  const tags = requested
    .filter((tag): tag is string => typeof tag === 'string' && TAG_PATTERN.test(tag))
    .slice(0, MAX_TAGS)

  if (tags.length === 0) {
    return new Response(null, {status: 400})
  }

  await dangerouslyDeleteByTag(tags)

  return new Response(null, {status: 204})
}

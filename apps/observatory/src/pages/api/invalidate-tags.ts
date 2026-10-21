import {dangerouslyDeleteByTag} from '@vercel/functions'
import type {APIRoute} from 'astro'
import {SANITY_INVALIDATE_SECRET} from 'astro:env/server'

import {purgeRejectionStatus} from '../../lib/purgeAuth'
import {parseSyncTags} from '../../lib/syncTags'

/**
 * Deletes every CDN-cached page whose `Vercel-Cache-Tag` includes one of the
 * given Content Lake sync tags:
 * https://vercel.com/docs/caching/cdn-cache/purge#programmatically-purging-cdn-cache
 *
 * Hard deletion rather than `invalidateByTag`, because the update toast asks
 * the visitor to refresh: a stale-while-revalidate response would make them
 * refresh twice to see the change.
 *
 * Fails closed. With `SANITY_INVALIDATE_SECRET` unset the endpoint returns
 * 503 and deletes nothing, so a deployment cannot be left open. With it set,
 * the request must send `Authorization: Bearer <secret>` (compared with
 * `timingSafeEqual`) or it returns 401. Browsers never call this: they cannot
 * hold the secret. A server-side caller, such as a Sync Tag Invalidate
 * Function, does:
 * https://www.sanity.io/docs/functions/sync-tag-function-quickstart
 * Pages also expire on their own (`PAGE_CACHE`), so a missed purge is bounded.
 */
export const POST: APIRoute = async ({request}) => {
  const rejection = purgeRejectionStatus(
    SANITY_INVALIDATE_SECRET,
    request.headers.get('authorization'),
  )
  if (rejection !== null) return new Response(null, {status: rejection})

  const tags = parseSyncTags(await request.json().catch(() => null))
  if (tags.length === 0) return new Response(null, {status: 400})

  await dangerouslyDeleteByTag(tags)
  return new Response(null, {status: 204})
}

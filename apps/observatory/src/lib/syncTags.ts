/** Content Lake sync tags look like `s1:WHrX/A`: a version prefix and a short opaque id. */
const SYNC_TAG_PATTERN = /^s1:[a-zA-Z0-9+/=_-]{1,124}$/
const MAX_TAGS = 64

/**
 * Picks the sync tags out of an `/api/invalidate-tags` request body. Anything
 * else is dropped, so a caller can only purge pages tagged with content ids,
 * never a tag shared by every page.
 */
export function parseSyncTags(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('tags' in body)) return []
  const {tags} = body
  if (!Array.isArray(tags)) return []
  const valid = tags.filter(
    (tag): tag is string => typeof tag === 'string' && SYNC_TAG_PATTERN.test(tag),
  )
  return [...new Set(valid)].slice(0, MAX_TAGS)
}

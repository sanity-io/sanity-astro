import {timingSafeEqual} from 'node:crypto'

/**
 * Whether `/api/invalidate-tags` may purge. The endpoint fails closed: with
 * no secret configured every request is refused (`503`), and a configured
 * secret is required as `Authorization: Bearer <secret>` (`401` otherwise).
 * `null` means the request is allowed to purge.
 */
export function purgeRejectionStatus(
  secret: string | undefined,
  authorization: string | null,
): 401 | 503 | null {
  if (!secret) return 503

  const given = Buffer.from(authorization ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 401

  return null
}

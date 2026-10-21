import {createHmac, timingSafeEqual} from 'node:crypto'

/**
 * The preview flag is an HMAC-signed expiry so a forged cookie cannot turn on
 * draft fetches. The read token doubles as the signing key: it is the secret
 * the flag protects, and it never leaves the server.
 */
function sign(secret: string, expiry: number): string {
  return createHmac('sha256', secret).update(`preview:${expiry}`).digest('base64url')
}

export function createPreviewFlag(secret: string, expiry: number): string {
  return `${expiry}.${sign(secret, expiry)}`
}

export function verifyPreviewFlag(
  secret: string,
  flag: string | undefined,
  now: number = Date.now(),
): boolean {
  if (flag === undefined) return false

  const [expiryPart, signature] = flag.split('.')
  const expiry = Number(expiryPart)
  if (!Number.isFinite(expiry) || expiry < now || signature === undefined) return false

  const expected = Buffer.from(sign(secret, expiry))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Allows `published`, `drafts` and release-name stacks like `rABC123,drafts`. */
export function sanitizePerspective(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || !/^[a-zA-Z0-9,_-]+$/.test(value)) return undefined
  return value
}

/** Variant ids are bare path segments: no dots, so they cannot address other documents. */
export function sanitizeVariant(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || !/^[a-zA-Z0-9_-]+$/.test(value)) return undefined
  return value
}

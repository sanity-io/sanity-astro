import {createHmac, timingSafeEqual} from 'node:crypto'

import type {AstroCookies} from 'astro'
import {SANITY_API_READ_TOKEN} from 'astro:env/server'

const PREVIEW_COOKIE = 'zenith_preview'
const PERSPECTIVE_COOKIE = 'sanity-preview-perspective'
const VARIANT_COOKIE = 'sanity-preview-variant'

/** Preview sessions expire after two hours; Presentation re-enables on load. */
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000

/**
 * Preview cookies are read inside the Presentation iframe on the studio
 * origin, which requires SameSite=None plus CHIPS partitioning.
 */
const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  partitioned: true,
} as const

export interface PreviewState {
  enabled: boolean
  perspective: string | undefined
  variant: string | undefined
}

/**
 * Partitioned cookies live in a separate jar per top-level site: a plain
 * `Set-Cookie` expiry without the same attributes does not remove them, so
 * deletion mirrors the exact attributes used when setting.
 */
function expireCookie(cookies: AstroCookies, name: string): void {
  cookies.set(name, '', {...COOKIE_OPTIONS, expires: new Date(0)})
}

export const DISABLED_PREVIEW: PreviewState = {
  enabled: false,
  perspective: undefined,
  variant: undefined,
}

/**
 * The preview flag is an HMAC-signed expiry so a forged cookie cannot turn on
 * draft fetches. The read token doubles as the signing key: it is the secret
 * the flag protects, and it never leaves the server. Without a token there is
 * nothing to protect (and no way to fetch drafts), so preview stays off.
 */
function sign(token: string, expiry: number): string {
  return createHmac('sha256', token).update(`preview:${expiry}`).digest('base64url')
}

export function enablePreview(
  cookies: AstroCookies,
  options: {perspective: string | undefined; variant: string | undefined},
): void {
  if (SANITY_API_READ_TOKEN === undefined) return

  const expiry = Date.now() + PREVIEW_TTL_MS
  cookies.set(PREVIEW_COOKIE, `${expiry}.${sign(SANITY_API_READ_TOKEN, expiry)}`, COOKIE_OPTIONS)

  setPreviewPerspective(cookies, sanitizePerspective(options.perspective))

  // Variant is optional on the enable URL, so entering preview without one
  // must clear any stale cookie from a previous session.
  setPreviewVariant(cookies, sanitizeVariant(options.variant))
}

export function setPreviewVariant(cookies: AstroCookies, variant: string | undefined): void {
  if (variant === undefined) {
    expireCookie(cookies, VARIANT_COOKIE)
  } else {
    cookies.set(VARIANT_COOKIE, variant, COOKIE_OPTIONS)
  }
}

export function setPreviewPerspective(
  cookies: AstroCookies,
  perspective: string | undefined,
): void {
  if (perspective === undefined) {
    expireCookie(cookies, PERSPECTIVE_COOKIE)
  } else {
    cookies.set(PERSPECTIVE_COOKIE, perspective, COOKIE_OPTIONS)
  }
}

export function disablePreview(cookies: AstroCookies): void {
  expireCookie(cookies, PREVIEW_COOKIE)
  expireCookie(cookies, PERSPECTIVE_COOKIE)
  expireCookie(cookies, VARIANT_COOKIE)
}

export function resolvePreview(cookies: AstroCookies): PreviewState {
  if (SANITY_API_READ_TOKEN === undefined) return DISABLED_PREVIEW

  const flag = cookies.get(PREVIEW_COOKIE)?.value
  if (flag === undefined) return DISABLED_PREVIEW

  const [expiryPart, signature] = flag.split('.')
  const expiry = Number(expiryPart)
  if (!Number.isFinite(expiry) || expiry < Date.now() || signature === undefined) {
    return DISABLED_PREVIEW
  }

  const expected = Buffer.from(sign(SANITY_API_READ_TOKEN, expiry))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return DISABLED_PREVIEW
  }

  return {
    enabled: true,
    perspective: sanitizePerspective(cookies.get(PERSPECTIVE_COOKIE)?.value),
    variant: sanitizeVariant(cookies.get(VARIANT_COOKIE)?.value),
  }
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

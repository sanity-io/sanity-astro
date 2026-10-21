import type {AstroCookies} from 'astro'
import {SANITY_API_READ_TOKEN} from 'astro:env/server'

import {
  createPreviewFlag,
  sanitizePerspective,
  sanitizeVariant,
  verifyPreviewFlag,
} from './previewFlag'

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

export const DISABLED_PREVIEW: PreviewState = {
  enabled: false,
  perspective: undefined,
  variant: undefined,
}

/**
 * Partitioned cookies live in a separate jar per top-level site: a plain
 * `Set-Cookie` expiry without the same attributes does not remove them, so
 * deletion mirrors the exact attributes used when setting.
 */
function expireCookie(cookies: AstroCookies, name: string): void {
  cookies.set(name, '', {...COOKIE_OPTIONS, expires: new Date(0)})
}

/** Without a read token there is no way to fetch drafts, so preview stays off. */
export function enablePreview(
  cookies: AstroCookies,
  options: {perspective: string | undefined; variant: string | undefined},
): void {
  if (SANITY_API_READ_TOKEN === undefined) return

  const flag = createPreviewFlag(SANITY_API_READ_TOKEN, Date.now() + PREVIEW_TTL_MS)
  cookies.set(PREVIEW_COOKIE, flag, COOKIE_OPTIONS)
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
  if (!verifyPreviewFlag(SANITY_API_READ_TOKEN, cookies.get(PREVIEW_COOKIE)?.value)) {
    return DISABLED_PREVIEW
  }

  return {
    enabled: true,
    perspective: sanitizePerspective(cookies.get(PERSPECTIVE_COOKIE)?.value),
    variant: sanitizeVariant(cookies.get(VARIANT_COOKIE)?.value),
  }
}

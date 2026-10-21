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
/** Marks that the session cookies were written with CHIPS partitioning. */
const PARTITIONED_COOKIE = 'zenith_preview_partitioned'

/** Preview sessions expire after two hours; Presentation re-enables on load. */
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000

/**
 * Preview cookies need SameSite=None so Presentation can read them inside its
 * cross-origin iframe. CHIPS partitioning is applied only for that cross-site
 * iframe case — always partitioning would store them under the studio's jar,
 * so a top-level tab on the site origin would not see them.
 */
function cookieOptions(partitioned: boolean) {
  return {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    ...(partitioned ? {partitioned: true as const} : {}),
  }
}

/** Safari 18.4+ drops unpartitioned third-party cookies in cross-site iframes. */
function isCrossSiteIframe(request: Request): boolean {
  return (
    request.headers.get('sec-fetch-dest') === 'iframe' &&
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
}

/**
 * Enable sees Sec-Fetch directly; later picker POSTs are same-origin fetches
 * from the framed page, so they consult the partitioned marker cookie instead.
 */
function usePartitioned(cookies: AstroCookies, request?: Request): boolean {
  if (request !== undefined && isCrossSiteIframe(request)) return true
  return cookies.get(PARTITIONED_COOKIE)?.value === '1'
}

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
 * deletion mirrors both the partitioned and unpartitioned write shapes.
 */
function expireCookie(cookies: AstroCookies, name: string): void {
  cookies.set(name, '', {...cookieOptions(false), expires: new Date(0)})
  cookies.set(name, '', {...cookieOptions(true), expires: new Date(0)})
}

/** Without a read token there is no way to fetch drafts, so preview stays off. */
export function enablePreview(
  cookies: AstroCookies,
  request: Request,
  options: {perspective: string | undefined; variant: string | undefined},
): void {
  if (SANITY_API_READ_TOKEN === undefined) return

  const partitioned = usePartitioned(cookies, request)

  // Visible only inside the same cross-site iframe partition, so later picker
  // writes can match the attributes used at enable time.
  if (partitioned) {
    cookies.set(PARTITIONED_COOKIE, '1', cookieOptions(true))
  } else {
    expireCookie(cookies, PARTITIONED_COOKIE)
  }

  const flag = createPreviewFlag(SANITY_API_READ_TOKEN, Date.now() + PREVIEW_TTL_MS)
  cookies.set(PREVIEW_COOKIE, flag, cookieOptions(partitioned))
  setPreviewPerspective(cookies, sanitizePerspective(options.perspective), request)

  // Variant is optional on the enable URL, so entering preview without one
  // must clear any stale cookie from a previous session.
  setPreviewVariant(cookies, sanitizeVariant(options.variant), request)
}

export function setPreviewVariant(
  cookies: AstroCookies,
  variant: string | undefined,
  request?: Request,
): void {
  if (variant === undefined) {
    expireCookie(cookies, VARIANT_COOKIE)
  } else {
    cookies.set(VARIANT_COOKIE, variant, cookieOptions(usePartitioned(cookies, request)))
  }
}

export function setPreviewPerspective(
  cookies: AstroCookies,
  perspective: string | undefined,
  request?: Request,
): void {
  if (perspective === undefined) {
    expireCookie(cookies, PERSPECTIVE_COOKIE)
  } else {
    cookies.set(PERSPECTIVE_COOKIE, perspective, cookieOptions(usePartitioned(cookies, request)))
  }
}

export function disablePreview(cookies: AstroCookies): void {
  expireCookie(cookies, PREVIEW_COOKIE)
  expireCookie(cookies, PERSPECTIVE_COOKIE)
  expireCookie(cookies, VARIANT_COOKIE)
  expireCookie(cookies, PARTITIONED_COOKIE)
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

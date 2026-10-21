import type {AstroCookies} from 'astro'
import {SANITY_API_READ_TOKEN} from 'astro:env/server'

import {previewCookieHeaders} from './previewCookies'
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

/** Without a read token there is no way to fetch drafts, so preview stays off. */
export function enablePreview(options: {
  perspective: string | undefined
  variant: string | undefined
}): readonly string[] {
  if (SANITY_API_READ_TOKEN === undefined) return []

  const flag = createPreviewFlag(SANITY_API_READ_TOKEN, Date.now() + PREVIEW_TTL_MS)

  // Variant is optional on the enable URL, so entering preview without one
  // must clear any stale cookie from a previous session.
  return [
    ...previewCookieHeaders(PREVIEW_COOKIE, flag),
    ...setPreviewPerspective(sanitizePerspective(options.perspective)),
    ...setPreviewVariant(sanitizeVariant(options.variant)),
  ]
}

export function setPreviewVariant(variant: string | undefined): readonly string[] {
  return previewCookieHeaders(VARIANT_COOKIE, variant)
}

export function setPreviewPerspective(perspective: string | undefined): readonly string[] {
  return previewCookieHeaders(PERSPECTIVE_COOKIE, perspective)
}

export function disablePreview(): readonly string[] {
  return [
    ...previewCookieHeaders(PREVIEW_COOKIE, undefined),
    ...previewCookieHeaders(PERSPECTIVE_COOKIE, undefined),
    ...previewCookieHeaders(VARIANT_COOKIE, undefined),
  ]
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

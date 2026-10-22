import type {APIRoute} from 'astro'

import {setPreviewVariant} from '../../../lib/preview'
import {applySetCookies} from '../../../lib/previewCookies'
import {sanitizeVariant} from '../../../lib/previewFlag'

/**
 * Called by the Visual Editing overlay when the variant picker changes, so
 * Presentation can switch variants in place instead of reloading the whole
 * iframe through the enable route.
 */
export const POST: APIRoute = async ({request, locals}) => {
  if (!locals.preview.enabled) {
    return new Response(null, {status: 403})
  }

  const body: unknown = await request.json().catch(() => null)
  const requested =
    typeof body === 'object' && body !== null && 'variant' in body ? body.variant : null

  return applySetCookies(
    new Response(null, {status: 204}),
    setPreviewVariant(sanitizeVariant(typeof requested === 'string' ? requested : null)),
  )
}

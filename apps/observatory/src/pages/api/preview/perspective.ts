import type {APIRoute} from 'astro'

import {sanitizePerspective, setPreviewPerspective} from '../../../lib/preview'

/**
 * Called by the Visual Editing overlay when the perspective picker changes
 * (published, drafts or a release stack), so switches update the cookie
 * without reloading the whole iframe through the enable route.
 */
export const POST: APIRoute = async ({request, cookies, locals}) => {
  if (!locals.preview.enabled) {
    return new Response(null, {status: 403})
  }

  const body: unknown = await request.json().catch(() => null)
  const requested =
    typeof body === 'object' && body !== null && 'perspective' in body ? body.perspective : null

  // Release stacks arrive as arrays; the cookie stores them comma-joined.
  const normalized = Array.isArray(requested)
    ? requested.filter((part): part is string => typeof part === 'string').join(',')
    : typeof requested === 'string'
      ? requested
      : null

  setPreviewPerspective(cookies, sanitizePerspective(normalized))

  return new Response(null, {status: 204})
}

import {validatePreviewUrl} from '@sanity/preview-url-secret'
import type {APIRoute} from 'astro'
import {SANITY_API_READ_TOKEN} from 'astro:env/server'

import {enablePreview} from '../../../lib/preview'
import {parseEdition, PREVIEW_PREFIX} from '../../../lib/routing'
import {client} from '../../../sanity/client'

/**
 * Entered from the Presentation tool. The URL carries a short-lived secret
 * that is verified against the dataset before preview cookies are issued.
 */
export const GET: APIRoute = async ({request, cookies, redirect}) => {
  if (SANITY_API_READ_TOKEN === undefined) {
    return new Response(
      'Draft preview requires the SANITY_API_READ_TOKEN environment variable (see .env.example)',
      {status: 500},
    )
  }

  const {
    isValid,
    redirectTo = '/',
    studioPreviewPerspective,
    studioPreviewVariant,
  } = await validatePreviewUrl(client.withConfig({useCdn: false}), request.url)

  if (!isValid) {
    return new Response('Invalid secret', {status: 401})
  }

  enablePreview(cookies, request, {
    perspective: studioPreviewPerspective ?? undefined,
    variant: studioPreviewVariant ?? undefined,
  })

  // Drafts render only under the uncached `/preview` prefix. Presentation is
  // configured with prefixed routes, but a bare path is mapped onto it too.
  const target =
    parseEdition(new URL(redirectTo, request.url).pathname).kind === 'preview'
      ? redirectTo
      : `${PREVIEW_PREFIX}${redirectTo === '/' ? '' : redirectTo}`

  return redirect(target, 307)
}

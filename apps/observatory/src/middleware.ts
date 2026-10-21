import {PUBLIC_SANITY_VARIANTS_ENABLED} from 'astro:env/server'
import {defineMiddleware} from 'astro:middleware'

import {applyAudienceSwitch, resolveAudience} from './lib/audience'
import {resolvePreview} from './lib/preview'

export const onRequest = defineMiddleware(async (context, next) => {
  const preview = resolvePreview(context.cookies)
  context.locals.preview = preview

  // While previewing, the variant comes from the Presentation variant picker,
  // so request-based personalization is suspended. Without the variants beta
  // on the project, personalization stays off entirely.
  if (preview.enabled || !PUBLIC_SANITY_VARIANTS_ENABLED) {
    context.locals.audience = undefined
  } else {
    const audienceSwitch = applyAudienceSwitch(context)
    if (audienceSwitch !== undefined) return audienceSwitch
    context.locals.audience = resolveAudience(context.url, context.cookies)
  }

  const response = await next()

  if (response.headers.get('content-type')?.includes('text/html')) {
    if (preview.enabled) {
      // Draft previews are per-editor and must never be cached anywhere: a
      // CDN hit would both bypass the preview cookie's expiry check and keep
      // serving stale drafts to Presentation, which refreshes after every
      // edit without changing the cache key. The CDN directives themselves
      // are applied through `Astro.cache.set` after this middleware runs, so
      // pages must not (and do not) forward cache hints while previewing.
      response.headers.set('cache-control', 'private, no-store')
    } else {
      // CDN cache keys never derive from response content, only from the
      // URL and Vary'd request headers. Keying on the cookie is what gives
      // each audience its own entry (and cookieless traffic a shared one);
      // caching policy itself is set through Astro.cache by the pages.
      response.headers.set('vary', 'Cookie')
    }
  }

  return response
})

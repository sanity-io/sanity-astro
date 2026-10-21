import {PUBLIC_SANITY_VARIANTS_ENABLED} from 'astro:env/server'
import {defineMiddleware} from 'astro:middleware'

import {audienceFromUtmSource} from './lib/audience'
import {DISABLED_PREVIEW, resolvePreview} from './lib/preview'
import {audienceBasePath, parseEdition, PREVIEW_PREFIX, withBase} from './lib/routing'

/**
 * Routes each request to its edition. The CDN caches on the URL alone, so
 * nothing here reads a cookie for a cacheable response: drafts render only
 * under `/preview/*`, which is never cached, and each audience edition has
 * its own `/for/<audience>/*` URL. Both are rewritten onto the same pages.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const {url} = context
  const edition = parseEdition(url.pathname)

  if (edition.kind === 'preview') {
    const preview = resolvePreview(context.cookies)
    // Without a valid preview session the URL has nothing to show beyond the
    // published page, which lives at the unprefixed path.
    if (!preview.enabled) return context.redirect(`${edition.path}${url.search}`, 307)

    context.locals.preview = preview
    context.locals.audience = undefined
    context.locals.basePath = PREVIEW_PREFIX
    const response = await next(`${edition.path}${url.search}`)
    // Runs after the page's own `Astro.cache.set`, so drafts are never stored
    // by the CDN, and browsers are told not to keep them either.
    context.cache.set(false)
    response.headers.set('cache-control', 'private, no-store')
    return response
  }

  context.locals.preview = DISABLED_PREVIEW

  if (edition.kind === 'audience') {
    // Without the variants beta there is a single edition.
    if (!PUBLIC_SANITY_VARIANTS_ENABLED) {
      return context.redirect(`${edition.path}${url.search}`, 302)
    }
    context.locals.audience = edition.audience
    context.locals.basePath = audienceBasePath(edition.audience)
    return next(`${edition.path}${url.search}`)
  }

  context.locals.audience = undefined
  context.locals.basePath = ''

  // Campaign links land on their audience's edition. The redirect is the only
  // per-request decision, and it is keyed on the query string, which is part
  // of the CDN cache key.
  if (PUBLIC_SANITY_VARIANTS_ENABLED && context.request.method === 'GET') {
    const audience = audienceFromUtmSource(url.searchParams.get('utm_source'))
    const isPage = !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/_')
    if (audience !== undefined && isPage) {
      return context.redirect(
        `${withBase(url.pathname, audienceBasePath(audience))}${url.search}`,
        302,
      )
    }
  }

  return next()
})

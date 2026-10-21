import {stegaClean} from '@sanity/client/stega'

import {type Audience, isAudience} from './audience'

/**
 * The CDN keys its cache on the URL alone, so every rendering that differs
 * has its own path: draft preview lives under `/preview/*` (never cached),
 * each audience edition under `/for/<audience>/*` (cached per edition), and
 * the shared published site everywhere else. Middleware rewrites the prefixed
 * paths onto the same page routes.
 */
export const PREVIEW_PREFIX = '/preview'
export const AUDIENCE_PREFIX = '/for'

export type Edition =
  | {kind: 'preview'; path: string}
  | {kind: 'audience'; audience: Audience; path: string}
  | {kind: 'public'; path: string}

function stripPrefix(pathname: string, prefix: string): string | undefined {
  if (pathname === prefix) return '/'
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length)
  return undefined
}

export function parseEdition(pathname: string): Edition {
  const previewPath = stripPrefix(pathname, PREVIEW_PREFIX)
  if (previewPath !== undefined) return {kind: 'preview', path: previewPath}

  const audiencePath = stripPrefix(pathname, AUDIENCE_PREFIX)
  if (audiencePath !== undefined) {
    const [, segment = '', ...rest] = audiencePath.split('/')
    if (isAudience(segment)) {
      return {kind: 'audience', audience: segment, path: `/${rest.join('/')}`}
    }
  }

  return {kind: 'public', path: pathname}
}

export function audienceBasePath(audience: Audience): string {
  return `${AUDIENCE_PREFIX}/${audience}`
}

/**
 * Keeps navigation inside the current edition: same-origin page links get the
 * edition prefix, while external links, API routes and assets pass through.
 * Hrefs come from Studio, so they are stega-cleaned before parsing.
 */
export function withBase(href: string, base: string): string {
  const clean = stegaClean(href)
  if (base === '' || !clean.startsWith('/') || clean.startsWith('//')) return clean
  if (clean === '/api' || clean.startsWith('/api/') || clean.startsWith('/_')) return clean
  return clean === '/' ? base : `${base}${clean}`
}

import type {APIContext} from 'astro'
import type {AstroCookies} from 'astro'

export const AUDIENCES = [
  {id: 'families', label: 'Families'},
  {id: 'stargazers', label: 'Stargazers'},
] as const

export type Audience = (typeof AUDIENCES)[number]['id']

export const AUDIENCE_COOKIE = 'zenith_audience'

const AUDIENCE_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: true,
} as const

/** Value for the `audience` query parameter that clears the stored audience. */
export const AUDIENCE_RESET = 'everyone'

const AUDIENCE_IDS = new Set<string>(AUDIENCES.map((audience) => audience.id))

/**
 * Campaign traffic self-selects an audience: parenting and travel channels
 * get the family edition, astronomy communities get the stargazer edition.
 */
const UTM_SOURCE_AUDIENCES: Readonly<Record<string, Audience>> = {
  facebook: 'families',
  pinterest: 'families',
  tripadvisor: 'families',
  astrobin: 'stargazers',
  cloudynights: 'stargazers',
  skyandtelescope: 'stargazers',
}

export function isAudience(value: string | undefined): value is Audience {
  return value !== undefined && AUDIENCE_IDS.has(value)
}

/**
 * Handles the explicit `?audience=` switch (used by the "View as" toolbar):
 * persists or clears the cookie, then redirects to the same URL without the
 * parameter. The switch response itself carries `Set-Cookie` and is never
 * cached; landing on the clean URL keeps personalized pages CDN-cacheable
 * per cookie combination.
 */
export function applyAudienceSwitch(context: APIContext): Response | undefined {
  const {cookies, redirect, url} = context
  const queryValue = url.searchParams.get('audience')
  if (queryValue === null) return undefined

  if (isAudience(queryValue)) {
    persistAudience(cookies, queryValue)
  } else if (queryValue === AUDIENCE_RESET) {
    // Expire with the same attributes the cookie was set with, so deletion
    // matches it under every browser's rules.
    cookies.set(AUDIENCE_COOKIE, '', {...AUDIENCE_COOKIE_OPTIONS, expires: new Date(0)})
  }

  const target = new URL(url)
  target.searchParams.delete('audience')
  return redirect(`${target.pathname}${target.search}`, 302)
}

/**
 * Resolves the audience for a request: the `zenith_audience` cookie from an
 * explicit earlier choice first, then the `utm_source` of the current
 * campaign link. Campaign matches are persisted so the personalized edition
 * sticks across navigation.
 */
export function resolveAudience(url: URL, cookies: AstroCookies): Audience | undefined {
  const cookieValue = cookies.get(AUDIENCE_COOKIE)?.value
  if (isAudience(cookieValue)) {
    return cookieValue
  }

  const utmSource = url.searchParams.get('utm_source')?.toLowerCase()
  const utmAudience = utmSource === undefined ? undefined : UTM_SOURCE_AUDIENCES[utmSource]
  if (utmAudience !== undefined) {
    persistAudience(cookies, utmAudience)
    return utmAudience
  }

  return undefined
}

function persistAudience(cookies: AstroCookies, audience: Audience): void {
  cookies.set(AUDIENCE_COOKIE, audience, {
    ...AUDIENCE_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  })
}

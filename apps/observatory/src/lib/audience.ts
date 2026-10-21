export const AUDIENCES = [
  {id: 'families', label: 'Families'},
  {id: 'stargazers', label: 'Stargazers'},
] as const

export type Audience = (typeof AUDIENCES)[number]['id']

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

export function audienceFromUtmSource(utmSource: string | null): Audience | undefined {
  if (utmSource === null) return undefined
  return UTM_SOURCE_AUDIENCES[utmSource.toLowerCase()]
}

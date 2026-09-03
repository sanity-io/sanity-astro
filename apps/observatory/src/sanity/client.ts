import {type ClientPerspective, createClient, validateApiPerspective} from '@sanity/client'
import {
  PUBLIC_SANITY_DATASET,
  PUBLIC_SANITY_PROJECT_ID,
  PUBLIC_SANITY_STUDIO_URL,
  SANITY_API_READ_TOKEN,
} from 'astro:env/server'

/** Content variants are served under the `X` API version while in beta. */
export const apiVersion = 'X'

/**
 * The dataset is public, so published reads need no credentials. The token is
 * only used for draft fetches while previewing, and it stays on the server:
 * all pages are rendered on demand and no Sanity credentials ship to the
 * browser. Stega stays off by default; preview fetches opt in with
 * `stega: true` and encode against the studio URL configured here.
 */
export const client = createClient({
  projectId: PUBLIC_SANITY_PROJECT_ID,
  dataset: PUBLIC_SANITY_DATASET,
  apiVersion,
  useCdn: true,
  ...(SANITY_API_READ_TOKEN === undefined ? {} : {token: SANITY_API_READ_TOKEN}),
  perspective: 'published',
  stega: {studioUrl: PUBLIC_SANITY_STUDIO_URL},
})

/** The perspective cookie mirrors what the studio emits: `drafts`, `published` or a release stack. */
export function toPerspective(value: string | undefined): ClientPerspective {
  if (value === undefined) return 'drafts'
  const perspective = value.includes(',') ? value.split(',') : value
  try {
    validateApiPerspective(perspective)
    return perspective
  } catch {
    return 'drafts'
  }
}

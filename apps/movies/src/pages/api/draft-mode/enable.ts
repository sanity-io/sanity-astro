import type {APIRoute} from 'astro'
import {createClient} from '@sanity/client'
import {defineEnableDraftMode} from '@sanity/astro'

// Create a client with a token for draft mode validation
const client = createClient({
  projectId: '4j2qnyob',
  dataset: 'production',
  useCdn: false,
  token: import.meta.env.SANITY_API_READ_TOKEN,
})

const {enable} = defineEnableDraftMode({
  client,
  secret: import.meta.env.SANITY_PREVIEW_SECRET || import.meta.env.SANITY_API_READ_TOKEN,
})

export const GET: APIRoute = async (context) => {
  return enable(context as any)
}

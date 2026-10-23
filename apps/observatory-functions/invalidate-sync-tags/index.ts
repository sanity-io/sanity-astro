import {syncTagInvalidateEventHandler} from '@sanity/functions'

/**
 * Forwards invalidated sync tags to the observatory's `/api/invalidate-tags` endpoint, then tells
 * Sanity it's done so the live event is released to `waitFor=function` clients with the CDN
 * already purged. `INVALIDATE_URL` and `SANITY_INVALIDATE_SECRET` are set by `sanity.blueprint.ts`.
 */
export const handler = syncTagInvalidateEventHandler(async ({event, done}) => {
  const {syncTags} = event.data

  try {
    await invalidate(syncTags)
  } catch (error) {
    console.error(
      'Failed to purge the observatory CDN cache, releasing the live event anyway',
      error,
    )
  }

  // Until `done` runs, Sanity holds the event back from every `waitFor=function` client.
  const response = await done(syncTags)
  if (!response.ok) {
    console.error('Sanity invalidation done endpoint responded with HTTP', response.status)
  }
})

async function invalidate(syncTags: string[]) {
  const url = process.env.INVALIDATE_URL
  const secret = process.env.SANITY_INVALIDATE_SECRET
  if (!url || !secret) {
    throw new Error('INVALIDATE_URL and SANITY_INVALIDATE_SECRET must be set on the function')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({tags: syncTags}),
  })
  if (!response.ok) {
    throw new Error(`${url} responded with HTTP ${response.status}: ${await response.text()}`)
  }
  console.log(`Purged ${syncTags.length} sync tags:`, syncTags.join(', '))
}

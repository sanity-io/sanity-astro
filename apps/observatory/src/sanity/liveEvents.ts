import {PUBLIC_SANITY_LIVE_WAIT_FOR_FUNCTION} from 'astro:env/server'

import {client} from './client'

/**
 * Live events are opaque sync-tag notifications, so the endpoint is safe to
 * subscribe to straight from the browser without a token. The URL is resolved
 * the same way `client.live.events()` resolves it, so it always matches the
 * client's project, dataset and API version (and never the API CDN host).
 *
 * With `waitFor=function`, Sanity releases each event only after the sync tag
 * invalidate Function has purged the CDN and called `done`.
 */
export const LIVE_EVENTS_URL = new URL(client.getUrl(client.getDataUrl('live/events'), false))
if (PUBLIC_SANITY_LIVE_WAIT_FOR_FUNCTION) LIVE_EVENTS_URL.searchParams.set('waitFor', 'function')

/** The origin alone, for the layout's preconnect in the document head. */
export const {origin: LIVE_EVENTS_ORIGIN} = LIVE_EVENTS_URL

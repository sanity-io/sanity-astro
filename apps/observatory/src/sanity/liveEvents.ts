import {client} from './client'

/**
 * Live events are opaque sync-tag notifications, so the endpoint is safe to
 * subscribe to straight from the browser without a token. The URL is resolved
 * the same way `client.live.events()` resolves it, so it always matches the
 * client's project, dataset and API version (and never the API CDN host).
 */
export const LIVE_EVENTS_URL = new URL(client.getUrl(client.getDataUrl('live/events'), false))

/** The origin alone, for the layout's preconnect in the document head. */
export const {origin: LIVE_EVENTS_ORIGIN} = LIVE_EVENTS_URL

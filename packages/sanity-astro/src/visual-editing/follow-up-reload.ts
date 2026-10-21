import type {HistoryRefresh} from '@sanity/visual-editing/react'

/**
 * After a change-triggered (`source: 'mutation'`) refresh, `@sanity/visual-editing`
 * schedules a second `refresh()` one second later to account for Content Lake
 * eventual consistency, so edits typed while the first refresh was in flight are
 * not left out of the preview. The default refresh here is a full
 * `window.location.reload()`, which discards that pending timer along with the
 * rest of the page. These helpers carry the "follow-up pending" state across the
 * reload so the next page can perform that one extra reload itself.
 */
export const FOLLOW_UP_RELOAD_KEY = '@sanity/astro:follow-up-reload'

export type FollowUpReloadHost = {
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  location: Pick<Location, 'href'>
  setTimeout: (callback: () => void, delayMs: number) => number
  clearTimeout: (id: number) => void
}

/**
 * Call right before the page reloads in response to `payload`. The marker
 * records the URL being reloaded so a navigation that wins the race against
 * the reload (e.g. Presentation switching documents) is not mistaken for it.
 */
export function markFollowUpReload(
  payload: HistoryRefresh,
  host: Pick<FollowUpReloadHost, 'sessionStorage' | 'location'>,
): void {
  if (payload.source !== 'mutation') {
    return
  }
  try {
    host.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, host.location.href)
  } catch {
    // Storage can be unavailable (e.g. a sandboxed iframe); skip the follow-up.
  }
}

function clearMarker(host: Pick<FollowUpReloadHost, 'sessionStorage'>): void {
  try {
    host.sessionStorage.removeItem(FOLLOW_UP_RELOAD_KEY)
  } catch {
    // Unavailable storage never held a marker to begin with.
  }
}

/**
 * Call on page arrival. If `markFollowUpReload` left a marker for this URL,
 * schedules exactly one `reload` after `delayMs` and returns a function that
 * cancels it; otherwise returns `undefined`. A marker for another URL is
 * discarded.
 *
 * The marker is consumed when the reload fires, not when it is scheduled, so
 * cancelling leaves it in place: an island that unmounts and mounts again on
 * the same page (React Strict Mode, an island remount) arms the follow-up anew
 * instead of losing it.
 */
export function scheduleFollowUpReload(
  host: FollowUpReloadHost,
  reload: () => void,
  delayMs: number,
): (() => void) | undefined {
  let marker: string | null
  try {
    marker = host.sessionStorage.getItem(FOLLOW_UP_RELOAD_KEY)
  } catch {
    return undefined
  }
  if (marker === null) {
    return undefined
  }
  if (marker !== host.location.href) {
    clearMarker(host)
    return undefined
  }
  const id = host.setTimeout(() => {
    clearMarker(host)
    reload()
  }, delayMs)
  return () => host.clearTimeout(id)
}

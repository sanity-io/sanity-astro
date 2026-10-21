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

/**
 * Call once on page arrival. Consumes the marker left by `markFollowUpReload`
 * and, if it was left for this URL, schedules exactly one `reload` after
 * `delayMs`. Returns a cancel function when a reload was scheduled, otherwise
 * `undefined`.
 */
export function scheduleFollowUpReload(
  host: FollowUpReloadHost,
  reload: () => void,
  delayMs: number,
): (() => void) | undefined {
  let pending = false
  try {
    const marker = host.sessionStorage.getItem(FOLLOW_UP_RELOAD_KEY)
    if (marker !== null) {
      host.sessionStorage.removeItem(FOLLOW_UP_RELOAD_KEY)
      pending = marker === host.location.href
    }
  } catch {
    pending = false
  }
  if (!pending) {
    return undefined
  }
  const id = host.setTimeout(reload, delayMs)
  return () => host.clearTimeout(id)
}

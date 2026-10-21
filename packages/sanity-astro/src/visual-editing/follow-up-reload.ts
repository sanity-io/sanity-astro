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
  setTimeout: (callback: () => void, delayMs: number) => number
  clearTimeout: (id: number) => void
  /** Used to distinguish a true `location.reload()` from same-tab navigations. */
  performance?: Pick<Performance, 'getEntriesByType'>
}

/** Call right before the page reloads in response to `payload`. */
export function markFollowUpReload(
  payload: HistoryRefresh,
  host: Pick<FollowUpReloadHost, 'sessionStorage'>,
): void {
  if (payload.source !== 'mutation') {
    return
  }
  try {
    host.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, '1')
  } catch {
    // Storage can be unavailable (e.g. a sandboxed iframe); skip the follow-up.
  }
}

/**
 * Call once on page arrival. Consumes the marker left by `markFollowUpReload`
 * and schedules exactly one `reload` after `delayMs` — but only when this load
 * was itself a `reload`. A leftover marker after an ordinary navigation
 * (`location.assign`, document switch, etc.) is dropped so it cannot reload the
 * newly arrived page. Returns a cancel function when a reload was scheduled,
 * otherwise `undefined`.
 */
export function scheduleFollowUpReload(
  host: FollowUpReloadHost,
  reload: () => void,
  delayMs: number,
): (() => void) | undefined {
  let pending = false
  try {
    pending = host.sessionStorage.getItem(FOLLOW_UP_RELOAD_KEY) === '1'
    if (pending) {
      host.sessionStorage.removeItem(FOLLOW_UP_RELOAD_KEY)
    }
  } catch {
    pending = false
  }
  if (!pending) {
    return undefined
  }
  // sessionStorage survives same-tab navigations; only arm the follow-up when
  // the current load was actually caused by `location.reload()`.
  const navigation = host.performance?.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  if (navigation?.type !== 'reload') {
    return undefined
  }
  const id = host.setTimeout(reload, delayMs)
  return () => host.clearTimeout(id)
}

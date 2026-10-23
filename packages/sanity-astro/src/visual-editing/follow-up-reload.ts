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

type Marker = {href: string; id: string}

function parseMarker(value: string): Marker | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'href' in parsed &&
      typeof parsed.href === 'string' &&
      'id' in parsed &&
      typeof parsed.id === 'string'
    ) {
      return {href: parsed.href, id: parsed.id}
    }
  } catch {
    // Not written by `markFollowUpReload`; treated like a marker for another URL.
  }
  return undefined
}

/**
 * Call right before the page reloads in response to `payload`. The marker
 * records the URL being reloaded so a navigation that wins the race against
 * the reload (e.g. Presentation switching documents) is not mistaken for it,
 * and an id unique to this reload so a follow-up timer armed for an earlier
 * reload of the same URL cannot consume it.
 */
export function markFollowUpReload(
  payload: HistoryRefresh,
  host: Pick<FollowUpReloadHost, 'sessionStorage' | 'location'>,
): void {
  if (payload.source !== 'mutation') {
    return
  }
  const marker: Marker = {
    href: host.location.href,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  }
  try {
    host.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, JSON.stringify(marker))
  } catch {
    // Storage can be unavailable (e.g. a sandboxed iframe); skip the follow-up.
  }
}

function readMarker(host: Pick<FollowUpReloadHost, 'sessionStorage'>): string | null {
  try {
    return host.sessionStorage.getItem(FOLLOW_UP_RELOAD_KEY)
  } catch {
    return null
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
 * instead of losing it. The timer only consumes the marker it was armed for, so
 * a newer change-triggered reload that marked the page in the meantime keeps
 * its own follow-up.
 */
export function scheduleFollowUpReload(
  host: FollowUpReloadHost,
  reload: () => void,
  delayMs: number,
): (() => void) | undefined {
  const value = readMarker(host)
  if (value === null) {
    return undefined
  }
  if (parseMarker(value)?.href !== host.location.href) {
    clearMarker(host)
    return undefined
  }
  const id = host.setTimeout(() => {
    if (readMarker(host) === value) {
      clearMarker(host)
    }
    reload()
  }, delayMs)
  return () => host.clearTimeout(id)
}

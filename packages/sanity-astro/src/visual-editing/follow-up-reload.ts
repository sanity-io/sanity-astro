import type {HistoryRefresh} from '@sanity/visual-editing/react'

/**
 * Coordinates typing-loss prevention across iframe reloads in Sanity Presentation.
 *
 * 1. OBSERVE: When a live Studio edit emits a `mutation` `presentation/snapshot-event`,
 *    `FOLLOW_UP_RELOAD_KEY` is set to `location.href` in `sessionStorage`. If
 *    `document.readyState === 'complete'`, a fallback timer is armed for `delayMs` in case
 *    Comlink drops the accompanying `presentation/refresh`.
 * 2. ACKNOWLEDGE: When `refresh()` accepts a `'mutation'` or `'manual'` payload, it synchronously
 *    clears `FOLLOW_UP_RELOAD_KEY` and cancels any active fallback or arrival timer before reloading.
 * 3. RECONCILE: If a trailing keystroke emitted `presentation/snapshot-event` after
 *    acknowledgement (during the reload blanking interval or before Comlink handshakes on arrival),
 *    `FOLLOW_UP_RELOAD_KEY` still holds `location.href` on arrival; the new page immediately
 *    consumes the `sessionStorage` flag (discarding it if the URL changed) and schedules one
 *    reload after `delayMs`.
 */
export const FOLLOW_UP_RELOAD_KEY = '@sanity/astro:follow-up-reload'

export type FollowUpReloadHost = {
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  location: Pick<Location, 'href'>
  setTimeout: (callback: () => void, delayMs: number) => number
  clearTimeout: (id: number) => void
  self?: Window
  top?: Window | null
  document?: Pick<Document, 'readyState'>
  addEventListener?: Window['addEventListener']
  __sanityFallbackTimer?: number | null
  __sanityFollowUpInstalled?: boolean
  __sanityPendingFollowUpUrl?: string | null
  __sanityVEConfig?: {
    acknowledgeRefresh?: () => void
  }
}

/**
 * Reads and immediately removes `FOLLOW_UP_RELOAD_KEY` from `sessionStorage`,
 * returning `true` only when the stored marker matches the current `location.href`.
 */
function consumeFlag(
  host: Pick<FollowUpReloadHost, 'sessionStorage' | 'location'>,
): boolean {
  try {
    const storedHref = host.sessionStorage.getItem(FOLLOW_UP_RELOAD_KEY)
    if (storedHref === null) {
      return false
    }
    host.sessionStorage.removeItem(FOLLOW_UP_RELOAD_KEY)
    return storedHref === host.location.href
  } catch {
    return false
  }
}

function writeFlag(
  host: Pick<FollowUpReloadHost, 'sessionStorage' | 'location'>,
): void {
  try {
    host.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, host.location.href)
  } catch {
    // Storage can be unavailable (e.g. a sandboxed iframe); skip the follow-up.
  }
}

function clearFlag(host: Pick<FollowUpReloadHost, 'sessionStorage'>): void {
  try {
    host.sessionStorage.removeItem(FOLLOW_UP_RELOAD_KEY)
  } catch {
    // Unavailable storage never held a flag to begin with.
  }
}

/**
 * Synchronously clears `FOLLOW_UP_RELOAD_KEY` and disarms any pending fallback or
 * arrival reload timer when Visual Editing accepts a refresh.
 */
export function acknowledgeFollowUpReload(host: FollowUpReloadHost): void {
  clearFlag(host)
  host.__sanityPendingFollowUpUrl = null
  host.__sanityVEConfig?.acknowledgeRefresh?.()
  if (host.__sanityFallbackTimer) {
    host.clearTimeout(host.__sanityFallbackTimer)
    host.__sanityFallbackTimer = null
  }
}

/**
 * Retained for backwards signature compatibility; acknowledges and disarms any pending
 * follow-up state rather than arming an unconditional reload marker on refresh.
 */
export function markFollowUpReload(
  _payload: HistoryRefresh,
  host: FollowUpReloadHost,
): void {
  acknowledgeFollowUpReload(host)
}

/**
 * Attaches the `presentation/snapshot-event` observer if the inline `.astro` script
 * has not already installed it on `window`, and reconciles any unacknowledged mutation
 * flag present in `sessionStorage` upon page arrival.
 */
export function scheduleFollowUpReload(
  host: FollowUpReloadHost,
  reload: () => void,
  delayMs: number,
): (() => void) | undefined {
  if (host.self && host.top && host.self === host.top) {
    return undefined
  }
  if (delayMs <= 0) {
    return undefined
  }

  // Install the message and load listeners if `VisualEditingComponent` was mounted
  // without the inline script in `visual-editing.astro`.
  if (!host.__sanityFollowUpInstalled && typeof host.addEventListener === 'function') {
    host.__sanityFollowUpInstalled = true

    host.addEventListener('message', (e: MessageEvent) => {
      if (
        e.data?.type === 'presentation/snapshot-event' &&
        e.data?.data?.event?.type === 'mutation'
      ) {
        writeFlag(host)

        if (
          host.document?.readyState === 'complete' &&
          !host.__sanityFallbackTimer
        ) {
          host.__sanityFallbackTimer = host.setTimeout(() => {
            host.__sanityFallbackTimer = null
            host.__sanityPendingFollowUpUrl = null
            clearFlag(host)
            reload()
          }, delayMs)
        }
      }
    })

    host.addEventListener('load', () => {
      if (consumeFlag(host)) {
        host.__sanityPendingFollowUpUrl = host.location.href
        if (!host.__sanityFallbackTimer) {
          host.__sanityFallbackTimer = host.setTimeout(() => {
            host.__sanityFallbackTimer = null
            host.__sanityPendingFollowUpUrl = null
            reload()
          }, delayMs)
        }
      }
    })
  }

  // Reconcile immediately if the flag for this URL was in sessionStorage or was
  // handed off in-memory on this window (by window.load or a StrictMode remount).
  const hasStoredFlag = consumeFlag(host)
  const hasPendingUrl = host.__sanityPendingFollowUpUrl === host.location.href
  host.__sanityPendingFollowUpUrl = null

  if (hasStoredFlag || hasPendingUrl) {
    if (host.__sanityFallbackTimer) {
      host.clearTimeout(host.__sanityFallbackTimer)
      host.__sanityFallbackTimer = null
    }
    const targetHref = host.location.href
    const id = host.setTimeout(() => {
      host.__sanityFallbackTimer = null
      host.__sanityPendingFollowUpUrl = null
      reload()
    }, delayMs)
    host.__sanityFallbackTimer = id
    return () => {
      host.clearTimeout(id)
      if (host.__sanityFallbackTimer === id) {
        host.__sanityFallbackTimer = null
        host.__sanityPendingFollowUpUrl = targetHref
      }
    }
  }

  return undefined
}
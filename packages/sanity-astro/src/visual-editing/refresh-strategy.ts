import type {HistoryRefresh} from '@sanity/visual-editing/react'

import {
  acknowledgeFollowUpReload,
  type FollowUpReloadHost,
  scheduleFollowUpReload,
} from './follow-up-reload'

/**
 * How the default `refresh` brings the preview up to date when Presentation reports a change.
 * Experimental: the names and shapes may still change in a minor release.
 *
 * - `'reload'` (the default): a full `window.location.reload()`, exactly as before this option
 *   existed.
 * - `{type: 'reload', followUpDelayMs}`: the same reload, plus a reconciled or fallback reload
 *   `followUpDelayMs` later when a Studio `presentation/snapshot-event` arrives during the
 *   reload window or its accompanying Comlink refresh is dropped.
 *
 * Only plain, JSON-serializable values, so the `.astro` component can pass it to the browser.
 */
export type RefreshStrategy = 'reload' | {type: 'reload'; followUpDelayMs?: number}

/** `RefreshStrategy` with the shorthands expanded and invalid values dropped. */
export type ResolvedRefreshStrategy = {type: 'reload'; followUpDelayMs: number | undefined}

/**
 * Expands the shorthand and drops values that would do nothing (a missing, zero, negative or
 * non-finite delay), so every caller sees the same normalized shape. Also parses stringified
 * strategy objects if passed via template literal attribute syntax in `.astro` templates.
 */
export function resolveRefreshStrategy(
  strategy: RefreshStrategy | string | undefined,
): ResolvedRefreshStrategy {
  if (typeof strategy === 'string' && strategy !== 'reload') {
    const match = strategy.match(/followUpDelayMs\s*:\s*([+-]?\d+(?:\.\d+)?)/)
    if (strategy.includes('reload') && match) {
      const parsedDelay = Number(match[1])
      if (Number.isFinite(parsedDelay) && parsedDelay > 0) {
        return {type: 'reload', followUpDelayMs: parsedDelay}
      }
    }
    return {type: 'reload', followUpDelayMs: undefined}
  }

  // So far, we only handle the 'reload' strategy type, or none provided
  if (!strategy || typeof strategy !== 'object' || strategy.type !== 'reload') {
    return {type: 'reload', followUpDelayMs: undefined}
  }
  const {followUpDelayMs} = strategy
  const valid =
    typeof followUpDelayMs === 'number' && Number.isFinite(followUpDelayMs) && followUpDelayMs > 0
  return {type: 'reload', followUpDelayMs: valid ? followUpDelayMs : undefined}
}

export type DefaultRefreshHost = FollowUpReloadHost & {location: Pick<Location, 'href' | 'reload'>}

export interface DefaultRefresh {
  /** The `refresh` option for `VisualEditing`. */
  refresh: (payload: HistoryRefresh) => false | Promise<void>
  /**
   * Call once when the page arrives. Ensures the snapshot mutation observer is active and
   * reconciles any unacknowledged `presentation/snapshot-event` flag left in `sessionStorage`.
   */
  arrive: () => (() => void) | undefined
}

/** Builds the default `refresh` for the selected strategy. */
export function createDefaultRefresh(
  strategy: ResolvedRefreshStrategy,
  host: DefaultRefreshHost,
): DefaultRefresh {
  const {followUpDelayMs} = strategy
  const reload = () => host.location.reload()
  let cancelPending: (() => void) | undefined
  return {
    refresh: (payload) => {
      // Handle only 'mutation' and 'manual' refresh payloads, returning false otherwise.
      if (payload.source === 'mutation' || payload.source === 'manual') {
        // Clear FOLLOW_UP_RELOAD_KEY and any fallback/reconcile timer synchronously when
        // Visual Editing accepts the refresh, BEFORE any trailing preview-snapshots message arrives.
        cancelPending?.()
        cancelPending = undefined
        acknowledgeFollowUpReload(host)

        // Defer window.location.reload() to the next macrotask so Promise.resolve() returns
        // cleanly to the Comlink refresh handler before page teardown begins.
        host.setTimeout(() => {
          reload()
        }, 0)
        return Promise.resolve()
      }
      return false
    },
    arrive: () => {
      if (followUpDelayMs === undefined) {
        return undefined
      }
      const cancel = scheduleFollowUpReload(host, reload, followUpDelayMs)
      if (cancel === undefined) {
        return undefined
      }
      cancelPending = cancel
      return () => {
        cancel()
        if (cancelPending === cancel) {
          cancelPending = undefined
        }
      }
    },
  }
}
import type {HistoryRefresh} from '@sanity/visual-editing/react'

import {
  type FollowUpReloadHost,
  markFollowUpReload,
  scheduleFollowUpReload,
} from './follow-up-reload.js'

/**
 * How the default `refresh` brings the preview up to date when Presentation reports a change.
 * Experimental: the names and shapes may still change in a minor release.
 *
 * - `'reload'` (the default): a full `window.location.reload()`, exactly as before this option
 *   existed.
 * - `{type: 'reload', followUpDelayMs}`: the same reload, plus one more reload `followUpDelayMs`
 *   after a change-triggered one, so text typed in the Studio while the page was reloading
 *   still reaches the preview.
 *
 * Only plain, JSON-serializable values, so the `.astro` component can pass it to the browser.
 */
export type RefreshStrategy = 'reload' | {type: 'reload'; followUpDelayMs?: number}

/** `RefreshStrategy` with the shorthands expanded and invalid values dropped. */
export type ResolvedRefreshStrategy = {type: 'reload'; followUpDelayMs: number | undefined}

/**
 * Expands the shorthand and drops values that would do nothing (a missing, zero, negative or
 * non-finite delay), so every caller sees the same normalized shape.
 */
export function resolveRefreshStrategy(
  strategy: RefreshStrategy | undefined,
): ResolvedRefreshStrategy {
  if (strategy === undefined || strategy === 'reload') {
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
  refresh: (payload: HistoryRefresh) => Promise<void>
  /**
   * Call once when the page arrives. Starts the follow-up reload a change-triggered reload left
   * behind, if the strategy asks for one, and returns a function that cancels it.
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
      // This reload supersedes the pending follow-up, and the page it lands on arms its own.
      cancelPending?.()
      cancelPending = undefined
      if (followUpDelayMs !== undefined) {
        markFollowUpReload(payload, host)
      }
      reload()
      return Promise.resolve()
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

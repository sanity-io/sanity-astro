import type {HistoryRefresh} from '@sanity/visual-editing/enable-visual-editing'

export type {HistoryRefresh}

/**
 * What a morph pass did: brought the DOM up to date, or met one of the cases only a full reload
 * handles (the fetch failed, the response was not this page, the fresh HTML needs a script to
 * run). Anything thrown is a bug, not an outcome.
 */
export type MorphOutcome = 'applied' | 'reload'

export interface RefreshOptions {
  /** Applies fresh server HTML to the live DOM. Aborted on dispose. */
  morph: (signal: AbortSignal) => Promise<MorphOutcome>
  /** Full page fallback. The page unloads, so callers rarely observe anything after it. */
  reload: () => void
  /**
   * Trailing delay between the last mutation event and the fetch. Content Lake makes a
   * transaction visible to listeners before queries see it, so fetching right away can return
   * HTML older than the event that triggered it. Instant text patches cover the wait.
   */
  mutationDelayMs?: number
  /**
   * Delay before one more fetch after a morph that the document stream asked for, catching the
   * rare case where the first fetch still raced the query index. Presentation's own mutation
   * refresh already fires twice, so it does not get a settle pass on top.
   */
  settleDelayMs?: number
}

export interface Refresher {
  /** The `refresh` option for `enableVisualEditing`. */
  refresh: (payload: HistoryRefresh) => Promise<void> | false
  /** The document stream saw a change. Bursts collapse into one fetch plus a settle pass. */
  schedule: () => void
  /** Reconciles now. Resolves when the DOM matches the server again. */
  flush: () => Promise<void>
  dispose: () => void
}

const DEFAULT_MUTATION_DELAY_MS = 500
const DEFAULT_SETTLE_DELAY_MS = 1_000

/**
 * Coalesces refresh requests into a single in-flight morph. A request that lands while a
 * morph is running marks the DOM dirty, and the pump runs again until nothing is dirty and no
 * delayed pass is pending. Every caller receives the same promise, settled once the DOM is
 * clean. The settle pass runs in the background and does not hold that promise.
 *
 * A morph that throws is reported once, and from then on the refresher reloads on every refresh
 * from Presentation and ignores the document stream: the explicit fallback for a bug, so that it
 * neither hides behind a reload nor leaves the preview stuck.
 */
export function createRefresher(options: RefreshOptions): Refresher {
  const {
    morph,
    reload,
    mutationDelayMs = DEFAULT_MUTATION_DELAY_MS,
    settleDelayMs = DEFAULT_SETTLE_DELAY_MS,
  } = options
  let dirty = false
  let settle = false
  let pumping = false
  let drained: {promise: Promise<void>; resolve: () => void} | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let disposed = false
  let broken = false

  const untilDrained = () => {
    if (!drained) {
      let resolve!: () => void
      const promise = new Promise<void>((next) => {
        resolve = next
      })
      drained = {promise, resolve}
    }
    return drained.promise
  }

  const settleDrained = () => {
    const settled = drained
    drained = undefined
    settled?.resolve()
  }

  const clearTimers = () => {
    clearTimeout(timer)
    clearTimeout(settleTimer)
    timer = undefined
    settleTimer = undefined
  }

  const pump = async () => {
    pumping = true
    while (dirty) {
      // `dispose` can run while a morph is awaited, so the flags are re-read on every lap.
      if (disposed || broken) {
        break
      }
      dirty = false
      controller = new AbortController()
      const {signal} = controller
      let outcome: MorphOutcome
      try {
        outcome = await morph(signal)
      } catch (error) {
        if (!signal.aborted) {
          console.error(
            '[@sanity/astro] The in-place refresh threw. Reloading the page on every refresh from now on.',
            error,
          )
          broken = true
          settle = false
          clearTimers()
          reload()
        }
        break
      } finally {
        controller = undefined
      }
      if (outcome === 'reload') {
        settle = false
        if (!signal.aborted) {
          reload()
        }
        break
      }
    }
    pumping = false
    if (settle && !disposed) {
      settle = false
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => void flush(), settleDelayMs)
    }
    if (timer === undefined) {
      settleDrained()
    }
  }

  const flush = () => {
    if (disposed) {
      return Promise.resolve()
    }
    clearTimers()
    dirty = true
    const promise = untilDrained()
    if (!pumping) {
      void pump()
    }
    return promise
  }

  const queue = (withSettle: boolean) => {
    if (disposed || broken) {
      return
    }
    settle ||= withSettle
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, mutationDelayMs)
  }

  return {
    refresh: (payload) => {
      if (disposed) {
        return false
      }
      if (broken) {
        reload()
        return Promise.resolve()
      }
      if (payload.source === 'manual') {
        return flush()
      }
      queue(false)
      return untilDrained()
    },
    schedule: () => queue(true),
    flush,
    dispose: () => {
      disposed = true
      clearTimers()
      controller?.abort()
      settleDrained()
    },
  }
}

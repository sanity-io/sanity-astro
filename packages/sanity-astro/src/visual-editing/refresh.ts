import type {HistoryRefresh} from '@sanity/visual-editing/enable-visual-editing'

export type {HistoryRefresh}

/**
 * `morph` fetches the current URL and patches the live DOM in place. `reload` is the
 * classic full page reload, kept for pages the morph cannot handle.
 */
export type RefreshStrategy = 'morph' | 'reload'

export interface RefreshOptions {
  strategy: RefreshStrategy
  /** Applies fresh server HTML to the live DOM. Rejects when it cannot. Aborted on dispose. */
  morph: (signal: AbortSignal) => Promise<void>
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
 */
export function createRefresher(options: RefreshOptions): Refresher {
  const {
    strategy,
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

  const pump = async () => {
    pumping = true
    while (dirty) {
      if (disposed) {
        break
      }
      dirty = false
      controller = new AbortController()
      try {
        await morph(controller.signal)
      } catch {
        if (!controller.signal.aborted) {
          reload()
        }
        break
      } finally {
        controller = undefined
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
    clearTimeout(timer)
    timer = undefined
    if (strategy === 'reload') {
      reload()
      return new Promise<void>(() => {})
    }
    dirty = true
    const promise = untilDrained()
    if (!pumping) {
      void pump()
    }
    return promise
  }

  const queue = (withSettle: boolean) => {
    if (disposed) {
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
      if (payload.source === 'manual' || strategy === 'reload') {
        return flush()
      }
      queue(false)
      return untilDrained()
    },
    schedule: () => queue(true),
    flush,
    dispose: () => {
      disposed = true
      clearTimeout(timer)
      clearTimeout(settleTimer)
      timer = undefined
      settleTimer = undefined
      controller?.abort()
      settleDrained()
    },
  }
}
